import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import {
  ageInYears, firstName, loadOrgBranding, originFor,
} from '../../../lib/studentAccess';
import { buildStudentWelcomeEmail, buildTutorAcceptanceNotificationEmail } from '../../../lib/emails/student';

// POST /api/student/accept-invitation
// Body: { token, full_name, date_of_birth (yyyy-mm-dd), password }
//
// Provisions the auth.users entry with role='student' app_metadata, creates
// the student_users row, marks portal_access as enabled+accepted, and sends
// the welcome email.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const body = (req.body ?? {}) as {
    token?: string; full_name?: string; date_of_birth?: string; password?: string;
  };
  const token = (body.token ?? '').trim();
  const fullName = (body.full_name ?? '').trim();
  const dob = (body.date_of_birth ?? '').trim();
  const password = body.password ?? '';
  if (!token) return res.status(400).json({ error: 'token required.' });
  if (!fullName) return res.status(400).json({ error: 'full_name required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return res.status(400).json({ error: 'date_of_birth must be yyyy-mm-dd.' });
  if (!password || password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, organization_id, student_id, invitation_email, invitation_expires_at, accepted_at, parental_consent_required, parental_consent_given_at')
    .eq('invitation_token', token)
    .maybeSingle();
  if (!access) return res.status(404).json({ error: 'Invitation not found.' });
  if (access.accepted_at) return res.status(400).json({ error: 'This invitation has already been used.' });
  if (access.invitation_expires_at && new Date(access.invitation_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This invitation has expired.' });
  }
  if (access.parental_consent_required && !access.parental_consent_given_at) {
    return res.status(400).json({ error: 'Parental consent has not been granted.' });
  }
  if (!access.invitation_email) return res.status(400).json({ error: 'Invitation has no email on file.' });

  // Age sanity check — refuse if claimed DOB makes them 5 or younger.  If the
  // student record had a DOB, ensure the claimed DOB matches (don't allow
  // a child to lie up to 16+).
  const age = ageInYears(dob);
  if (age == null || age < 5 || age > 120) {
    return res.status(400).json({ error: 'Date of birth is invalid.' });
  }
  const { data: stuRow } = await admin
    .from('students').select('name, date_of_birth, organization_id').eq('id', access.student_id).maybeSingle();
  if (stuRow?.date_of_birth && stuRow.date_of_birth !== dob) {
    return res.status(400).json({ error: 'Date of birth does not match what your tutor recorded. Ask them to update it.' });
  }

  // Provision auth user.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: access.invitation_email,
    password,
    email_confirm: true,
    app_metadata: { role: 'student' },
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Could not create account.';
    if (/already|registered/i.test(msg)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return res.status(500).json({ error: msg });
  }
  const authUserId = created.user.id;

  // Insert student_users row.
  const { data: studentUser, error: suErr } = await admin
    .from('student_users')
    .insert({
      student_id: access.student_id,
      email: access.invitation_email,
      full_name: fullName,
      date_of_birth: dob,
      auth_user_id: authUserId,
      last_login_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (suErr || !studentUser) {
    try { await admin.auth.admin.deleteUser(authUserId); } catch {}
    return res.status(500).json({ error: suErr?.message ?? 'Could not create student account.' });
  }

  // Mark portal_access accepted + enabled.
  await admin
    .from('student_portal_access')
    .update({
      accepted_at: new Date().toISOString(),
      enabled: true,
      enabled_at: new Date().toISOString(),
      invitation_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', access.id);

  // Send welcome + notify tutor.
  const branding = await loadOrgBranding(admin, access.organization_id);
  const portalUrl = `${originFor(req)}/student`;
  const studentFirstName = firstName(fullName);

  const welcome = buildStudentWelcomeEmail({
    studentFirstName,
    tutorBusinessName: branding.name,
    brandColor: branding.brandColor,
    portalUrl,
  });
  await sendEmail({ to: access.invitation_email, ...welcome, replyTo: branding.ownerEmail ?? undefined });

  if (branding.ownerEmail) {
    const e = buildTutorAcceptanceNotificationEmail({
      tutorEmail: branding.ownerEmail,
      studentName: stuRow?.name ?? fullName,
    });
    await sendEmail({ to: branding.ownerEmail, ...e });
  }

  await writeAudit(admin, {
    organizationId: access.organization_id,
    actorUserId: authUserId,
    actorRole: 'student',
    action: 'student_access.accepted',
    entityType: 'student',
    entityId: access.student_id,
    payload: { entity_name: stuRow?.name ?? fullName, student_user_id: studentUser.id },
  });

  return res.status(200).json({ ok: true });
}
