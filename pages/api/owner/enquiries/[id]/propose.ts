import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../../lib/agencyOrg';
import { writeAudit } from '../../../../../lib/audit';
import { sendEmail } from '../../../../../lib/email';
import { buildTutorProposalEmail } from '../../../../../lib/emails/agency';
import { OWNER_EMAIL } from '../../../../../lib/owner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/owner/enquiries/[id]/propose { tutor_id, message?, proposed_times? }
// Emails the family a tutor proposal and marks the enquiry contacted.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });
  const org = await getAgencyOrganization(admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const tutorId = typeof body.tutor_id === 'string' && UUID_RE.test(body.tutor_id) ? body.tutor_id : null;
  if (!tutorId) return res.status(400).json({ error: 'Choose a tutor first.' });
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  const proposedTimes = typeof body.proposed_times === 'string' ? body.proposed_times.trim().slice(0, 300) : '';

  const [{ data: enq }, { data: tutor }] = await Promise.all([
    admin.from('enquiries').select('*').eq('id', id).eq('organization_id', org.id).maybeSingle(),
    admin.from('tutors').select('id, name, bio, subjects, suburb, levels, mode, archived, wwcc_number, wwcc_verified_at, wwcc_expiry').eq('id', tutorId).eq('organization_id', org.id).maybeSingle(),
  ]);
  if (!enq) return res.status(404).json({ error: 'not_found' });
  if (!tutor || tutor.archived) return res.status(400).json({ error: 'invalid_tutor' });

  // Safety gate: never propose a tutor whose WWCC is not on file and verified.
  const expired = tutor.wwcc_expiry ? new Date(tutor.wwcc_expiry).getTime() < Date.now() : false;
  if (!tutor.wwcc_number || !tutor.wwcc_verified_at || expired) {
    return res.status(400).json({ error: `${tutor.name} does not have a verified, current Working With Children Check on file. Record it on their tutor page first.` });
  }

  if (!enq.email) return res.status(400).json({ error: 'This family gave a phone number only. Call them, or add their email to the household after converting.' });

  const built = buildTutorProposalEmail({
    parentName: enq.parent_name,
    studentFirstName: enq.student_first_name ?? null,
    yearLevel: enq.year_level,
    subjects: enq.subjects ?? [],
    mode: enq.mode,
    tutor: { name: tutor.name, bio: tutor.bio ?? null, subjects: tutor.subjects ?? null, suburb: tutor.suburb ?? null, levels: tutor.levels ?? null },
    ownerMessage: message || null,
    proposedTimes: proposedTimes || null,
  });
  const sent = await sendEmail({ to: String(enq.email), replyTo: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL, ...built });
  if (!sent.success) return res.status(500).json({ error: `Email failed: ${sent.error ?? 'unknown'}` });

  const { data: updated } = await admin
    .from('enquiries')
    .update({ assigned_tutor_id: tutorId, status: enq.status === 'new' ? 'contacted' : enq.status, contacted_at: enq.contacted_at ?? new Date().toISOString(), owner_notes: [enq.owner_notes, `Proposed ${tutor.name} by email on ${new Date().toLocaleDateString('en-AU')}${proposedTimes ? ` (times: ${proposedTimes})` : ''}.`].filter(Boolean).join('\n') })
    .eq('id', id)
    .select('id, status, owner_notes, assigned_tutor_id, contacted_at, converted_at, updated_at')
    .maybeSingle();

  await writeAudit(admin, { organizationId: org.id, actorUserId: userId, actorRole: 'owner', action: 'enquiry.tutor_proposed', entityType: 'enquiry', entityId: id, payload: { entity_name: enq.parent_name, tutor_id: tutorId, tutor_name: tutor.name } });
  return res.status(200).json({ ok: true, enquiry: updated });
}
