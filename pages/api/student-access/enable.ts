import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import {
  ageInYears, firstName, INVITATION_TTL_DAYS, loadFirstParent,
  loadOrgBranding, loadStudentForOrg, newToken, originFor,
} from '../../../lib/studentAccess';
import {
  buildParentConsentRequestEmail, buildStudentInvitationEmail,
} from '../../../lib/emails/student';

// POST /api/student-access/enable
// Body: { student_id: string, email?: string }
//
// Idempotent enablement.  Computes age from student.date_of_birth.  If under 16
// (or DOB unset), routes to the parent consent flow.  If 16+, sends invitation
// directly to the student email.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { student_id?: string; email?: string };
  if (!body.student_id) return res.status(400).json({ error: 'student_id required.' });
  const email = (body.email ?? '').trim().toLowerCase();

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const student = await loadStudentForOrg(admin, body.student_id, membership.organization_id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  // Tutors can only enable for students they teach.
  if (membership.role === 'tutor') {
    const { data: stu } = await admin
      .from('students')
      .select('primary_tutor_id')
      .eq('id', student.id)
      .maybeSingle();
    if (stu?.primary_tutor_id !== membership.tutor_id) {
      return res.status(403).json({ error: 'You can only enable access for your own students.' });
    }
  }

  const age = ageInYears(student.date_of_birth);
  const requiresConsent = age == null || age < 16;

  // Need an email for the student even when consent flows through the parent
  // first — the email is committed when consent is granted.
  if (!requiresConsent && !email) {
    return res.status(400).json({ error: 'Student email is required for 16 and over.' });
  }
  if (!requiresConsent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const parent = requiresConsent ? await loadFirstParent(admin, student.id) : null;
  if (requiresConsent && (!parent || !parent.email)) {
    return res.status(400).json({
      error: 'Add a parent with an email address before enabling portal access for under-16 students.',
    });
  }

  const branding = await loadOrgBranding(admin, membership.organization_id);
  const origin = originFor(req);
  const studentFirstName = firstName(student.name);

  if (requiresConsent) {
    const consentToken = newToken();
    const { data: existing } = await admin
      .from('student_portal_access')
      .select('id, parental_consent_given_at')
      .eq('student_id', student.id)
      .maybeSingle();

    const upsert = {
      organization_id: membership.organization_id,
      student_id: student.id,
      enabled: false,
      parental_consent_required: true,
      parental_consent_given_at: existing?.parental_consent_given_at ?? null,
      parental_consent_token: consentToken,
      invitation_email: email || null,
      enabled_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error: upErr } = existing
      ? await admin.from('student_portal_access').update(upsert).eq('id', existing.id).select().maybeSingle()
      : await admin.from('student_portal_access').insert(upsert).select().maybeSingle();
    if (upErr) return res.status(500).json({ error: upErr.message });

    const consentUrl = `${origin}/parent/student/${student.id}/grant-access?token=${consentToken}`;
    const { subject, html, text } = buildParentConsentRequestEmail({
      parentName: parent!.name ?? 'there',
      studentFirstName,
      tutorBusinessName: branding.name,
      brandColor: branding.brandColor,
      consentUrl,
    });
    if (parent!.email) {
      await sendEmail({
        to: parent!.email, subject, html, text,
        replyTo: branding.ownerEmail ?? undefined,
      });
    }

    await writeAudit(admin, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: 'student_access.consent_requested',
      entityType: 'student',
      entityId: student.id,
      payload: { entity_name: student.name, parent_email: parent!.email },
    });

    return res.status(200).json({ ok: true, state: 'awaiting_consent', access: row });
  }

  // 16+: invitation goes directly to the student.
  const inviteToken = newToken();
  const expires = new Date(Date.now() + INVITATION_TTL_DAYS * 86400_000).toISOString();
  const { data: existing } = await admin
    .from('student_portal_access')
    .select('id')
    .eq('student_id', student.id)
    .maybeSingle();

  const upsert = {
    organization_id: membership.organization_id,
    student_id: student.id,
    enabled: false,
    parental_consent_required: false,
    parental_consent_given_at: null,
    invitation_email: email,
    invitation_token: inviteToken,
    invitation_sent_at: new Date().toISOString(),
    invitation_expires_at: expires,
    enabled_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { data: row, error: upErr } = existing
    ? await admin.from('student_portal_access').update(upsert).eq('id', existing.id).select().maybeSingle()
    : await admin.from('student_portal_access').insert(upsert).select().maybeSingle();
  if (upErr) return res.status(500).json({ error: upErr.message });

  const acceptUrl = `${origin}/student/accept?token=${inviteToken}`;
  const { subject, html, text } = buildStudentInvitationEmail({
    studentFirstName,
    tutorBusinessName: branding.name,
    brandColor: branding.brandColor,
    acceptUrl,
  });
  await sendEmail({
    to: email, subject, html, text,
    replyTo: branding.ownerEmail ?? undefined,
  });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'student_access.invitation_sent',
    entityType: 'student',
    entityId: student.id,
    payload: { entity_name: student.name, email },
  });

  return res.status(200).json({ ok: true, state: 'invited', access: row });
}
