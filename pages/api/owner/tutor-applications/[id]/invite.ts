import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../../lib/agencyOrg';
import { createTutorInvitation } from '../../../../../lib/tutorInvites';
import { writeAudit } from '../../../../../lib/audit';
import { subjectLabels } from '../../../../../lib/agency';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/owner/tutor-applications/[id]/invite
// Accepts the application: creates a tutors row carrying the vetting details,
// sends the existing tutor invitation email, marks the application accepted.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId, email: inviterEmail } = ctx;

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });

  const org = await getAgencyOrganization(admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const { data: app, error } = await admin
    .from('tutor_applications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!app) return res.status(404).json({ error: 'not_found' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const payRateCents = typeof body.pay_rate_cents === 'number' && Number.isFinite(body.pay_rate_cents) && body.pay_rate_cents >= 0
    ? Math.round(body.pay_rate_cents)
    : null;

  const invite = await createTutorInvitation({
    admin,
    organizationId: org.id,
    invitedByUserId: userId,
    inviterEmail,
    email: String(app.email).toLowerCase(),
    orgName: org.name,
    firstName: String(app.full_name).split(' ')[0] || null,
  });
  if (!invite.ok) return res.status(invite.status).json({ error: invite.error });

  // Tutor record (reuse by email if the owner already added them by hand).
  let tutorId: string | null = app.tutor_id ?? null;
  if (!tutorId) {
    const { data: existingTutor } = await admin
      .from('tutors').select('id').eq('organization_id', org.id).eq('email', app.email).maybeSingle();
    tutorId = existingTutor?.id ?? null;
  }
  const tutorFields = {
    name: app.full_name,
    email: app.email,
    phone: app.phone,
    subjects: subjectLabels(app.subjects ?? []),
    suburb: app.suburb,
    mode: app.mode,
    abn: app.abn,
    wwcc_number: app.wwcc_number,
    ...(payRateCents != null ? { pay_rate_cents: payRateCents } : {}),
    notes: [app.qualifications ? `Results: ${app.qualifications}` : null, app.availability ? `Availability: ${app.availability}` : null].filter(Boolean).join('\n') || null,
  };
  if (tutorId) {
    await admin.from('tutors').update(tutorFields).eq('id', tutorId);
  } else {
    const { data: created, error: tErr } = await admin
      .from('tutors')
      .insert({ owner_id: userId, organization_id: org.id, ...tutorFields })
      .select('id')
      .single();
    if (tErr) console.error('invite: tutor row create failed', tErr);
    tutorId = created?.id ?? null;
  }

  await admin
    .from('tutor_applications')
    .update({ status: 'accepted', decided_at: new Date().toISOString(), tutor_invitation_id: invite.invitationId, tutor_id: tutorId })
    .eq('id', id);

  await writeAudit(admin, {
    organizationId: org.id,
    actorUserId: userId,
    actorRole: 'owner',
    action: 'tutor_application.invited',
    entityType: 'tutor_application',
    entityId: id,
    payload: { entity_name: app.full_name, invitation_id: invite.invitationId, tutor_id: tutorId },
  });

  return res.status(200).json({ ok: true, invitation_id: invite.invitationId, accept_url: invite.acceptUrl, email_sent: invite.emailSent, tutor_id: tutorId });
}
