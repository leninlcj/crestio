import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import {
  firstName, INVITATION_TTL_DAYS, loadOrgBranding, newToken, originFor,
} from '../../../lib/studentAccess';
import { buildStudentInvitationEmail } from '../../../lib/emails/student';

// GET  /api/student-access/grant-consent?token=...     — validate the token
// POST /api/student-access/grant-consent
//   Body: { token, action: 'approve' | 'decline', student_email_for_invite? }
//
// Caller is the parent (authenticated via the parent portal session).  Token
// alone wouldn't be enough — we additionally verify the parent's auth_user_id
// is linked to this student via parent_student_links.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authToken = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!authToken) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${authToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(authToken);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const parentAuthId = userData.user.id;

  // Parent role check.
  const { data: parentRow } = await userClient
    .from('parents')
    .select('id, name, email')
    .eq('auth_user_id', parentAuthId)
    .maybeSingle();
  if (!parentRow) return res.status(403).json({ error: 'Only parents can grant consent.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const consentToken = (req.method === 'GET' ? req.query.token : (req.body ?? {}).token) as string | undefined;
  if (!consentToken || typeof consentToken !== 'string') {
    return res.status(400).json({ error: 'token required.' });
  }

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, organization_id, student_id, parental_consent_given_at, invitation_email, student:students(name, date_of_birth)')
    .eq('parental_consent_token', consentToken)
    .maybeSingle();
  if (!access) return res.status(404).json({ error: 'Token not found or already used.' });

  // Verify this parent is linked to this student.
  const { data: link } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', parentRow.id)
    .eq('student_id', (access as any).student_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (!link) return res.status(403).json({ error: 'You are not linked to this student.' });

  if (req.method === 'GET') {
    return res.status(200).json({
      valid: true,
      already_consented: !!access.parental_consent_given_at,
      student_name: (access as any).student?.name ?? '',
      student_email: access.invitation_email ?? null,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.body?.action ?? '') as string;
  if (action !== 'approve' && action !== 'decline') {
    return res.status(400).json({ error: 'action must be approve or decline.' });
  }

  const branding = await loadOrgBranding(admin, (access as any).organization_id);
  const studentFirstName = firstName((access as any).student?.name);

  if (action === 'decline') {
    await admin
      .from('student_portal_access')
      .update({
        enabled: false,
        parental_consent_given_at: null,
        parental_consent_token: null,
        invitation_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', access.id);

    await writeAudit(admin, {
      organizationId: (access as any).organization_id,
      actorUserId: parentAuthId,
      actorRole: 'parent',
      action: 'student_access.consent_declined',
      entityType: 'student',
      entityId: (access as any).student_id,
      payload: { entity_name: (access as any).student?.name, parent_id: parentRow.id },
    });

    // Notify tutor (best-effort, owner email).
    if (branding.ownerEmail) {
      const { buildTutorConsentDeclineNotificationEmail } = await import('../../../lib/emails/student');
      const e = buildTutorConsentDeclineNotificationEmail({
        parentName: parentRow.name ?? 'A parent',
        studentName: (access as any).student?.name ?? 'a student',
      });
      await sendEmail({ to: branding.ownerEmail, ...e });
    }

    return res.status(200).json({ ok: true, action: 'declined' });
  }

  // Approve.
  const studentEmail = ((req.body?.student_email_for_invite ?? access.invitation_email) ?? '').toString().trim().toLowerCase();
  if (!studentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    return res.status(400).json({ error: 'Student email is required to send the invitation.' });
  }

  const inviteToken = newToken();
  const expires = new Date(Date.now() + INVITATION_TTL_DAYS * 86400_000).toISOString();

  await admin
    .from('student_portal_access')
    .update({
      parental_consent_given_at: new Date().toISOString(),
      parental_consent_by_parent_id: parentRow.id,
      parental_consent_token: null,
      invitation_email: studentEmail,
      invitation_token: inviteToken,
      invitation_sent_at: new Date().toISOString(),
      invitation_expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq('id', access.id);

  const acceptUrl = `${originFor(req)}/student/accept?token=${inviteToken}`;
  const { subject, html, text } = buildStudentInvitationEmail({
    studentFirstName,
    tutorBusinessName: branding.name,
    brandColor: branding.brandColor,
    acceptUrl,
  });
  await sendEmail({ to: studentEmail, subject, html, text, replyTo: branding.ownerEmail ?? undefined });

  await writeAudit(admin, {
    organizationId: (access as any).organization_id,
    actorUserId: parentAuthId,
    actorRole: 'parent',
    action: 'student_access.consent_granted',
    entityType: 'student',
    entityId: (access as any).student_id,
    payload: { entity_name: (access as any).student?.name, parent_id: parentRow.id, student_email: studentEmail },
  });

  return res.status(200).json({ ok: true, action: 'approved' });
}
