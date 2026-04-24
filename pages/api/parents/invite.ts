import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendEmail } from '../../../lib/email';
import { buildParentInvitationEmail } from '../../../lib/emails/parentInvitation';
import { getOrganizationIdForUser } from '../../../lib/organization';
import { getMembershipForUser } from '../../../lib/membership';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('parents/invite: Supabase env vars missing');
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await client.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const tutorUserId = userData.user.id;
  const organizationId = await getOrganizationIdForUser(client, tutorUserId);
  if (!organizationId) {
    return res.status(500).json({ error: 'No organization found for this account.' });
  }
  const membership = await getMembershipForUser(client, tutorUserId);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can invite parents.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!studentId || !email) {
    return res.status(400).json({ error: 'studentId and email are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // Verify the tutor owns the student (RLS-scoped select).
  const { data: student, error: studentErr } = await client
    .from('students')
    .select('id, name')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .single();
  if (studentErr || !student) {
    return res.status(403).json({ error: 'You do not have access to that student.' });
  }

  // Fetch tutor's organization name for the email body.
  const { data: tutorOrg } = await client
    .from('organizations')
    .select('name')
    .eq('owner_user_id', tutorUserId)
    .maybeSingle();
  const { data: tutorProfile } = await client
    .from('profiles')
    .select('owner_name')
    .eq('id', tutorUserId)
    .maybeSingle();

  const invitationToken = randomBytes(32).toString('hex');

  const { data: invitation, error: inviteErr } = await client
    .from('parent_invitations')
    .insert({
      token: invitationToken,
      email,
      student_id: studentId,
      tutor_user_id: tutorUserId,
      organization_id: organizationId,
    })
    .select('id, token, expires_at')
    .single();
  if (inviteErr || !invitation) {
    console.error('parents/invite: insert failed', inviteErr);
    return res.status(500).json({ error: inviteErr?.message ?? 'Could not create invitation.' });
  }

  const origin = `https://${req.headers.host ?? 'crestio.ai'}`;
  const invitationUrl = `${origin}/parent/accept?token=${invitation.token}`;

  const tutorBusinessName =
    (tutorOrg?.name && tutorOrg.name.trim()) ||
    (tutorProfile?.owner_name && tutorProfile.owner_name.trim()) ||
    'Your tutor';
  const studentFirstName =
    (student.name ?? '').trim().split(/\s+/)[0] || 'your child';

  const { subject, html, text } = buildParentInvitationEmail({
    parentEmail: email,
    tutorBusinessName,
    studentFirstName,
    invitationUrl,
  });

  const emailResult = await sendEmail({ to: email, subject, html, text });
  if (!emailResult.success) {
    console.error('parents/invite: email send failed', emailResult.error);
  }

  return res.status(200).json({
    success: true,
    invitationUrl,
    invitationId: invitation.id,
    expiresAt: invitation.expires_at,
    emailSent: emailResult.success,
    ...(emailResult.success ? {} : { emailError: emailResult.error }),
  });
}
