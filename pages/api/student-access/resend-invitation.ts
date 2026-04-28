import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import {
  firstName, INVITATION_TTL_DAYS, loadOrgBranding, newToken, originFor,
} from '../../../lib/studentAccess';
import { buildStudentInvitationEmail } from '../../../lib/emails/student';

// POST /api/student-access/resend-invitation
// Body: { student_id: string }
// Generates a fresh token, extends the expiry, sends a new invitation email.
// Only valid when state is past consent (or no consent required) and the
// student has not yet accepted.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { student_id?: string };
  if (!body.student_id) return res.status(400).json({ error: 'student_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('*, student:students(name)')
    .eq('student_id', body.student_id)
    .maybeSingle();
  if (!access || (access as any).organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Access record not found.' });
  }
  if (access.accepted_at) {
    return res.status(400).json({ error: 'Student has already accepted.' });
  }
  if (access.parental_consent_required && !access.parental_consent_given_at) {
    return res.status(400).json({ error: 'Awaiting parental consent — resend the consent request instead.' });
  }
  if (!access.invitation_email) {
    return res.status(400).json({ error: 'No invitation email on file.' });
  }

  const branding = await loadOrgBranding(admin, membership.organization_id);
  const studentFirstName = firstName((access as any).student?.name);

  const newInviteToken = newToken();
  const expires = new Date(Date.now() + INVITATION_TTL_DAYS * 86400_000).toISOString();
  await admin
    .from('student_portal_access')
    .update({
      invitation_token: newInviteToken,
      invitation_sent_at: new Date().toISOString(),
      invitation_expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq('id', access.id);

  const acceptUrl = `${originFor(req)}/student/accept?token=${newInviteToken}`;
  const { subject, html, text } = buildStudentInvitationEmail({
    studentFirstName,
    tutorBusinessName: branding.name,
    brandColor: branding.brandColor,
    acceptUrl,
  });
  await sendEmail({ to: access.invitation_email, subject, html, text, replyTo: branding.ownerEmail ?? undefined });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'student_access.invitation_resent',
    entityType: 'student',
    entityId: body.student_id,
    payload: { entity_name: (access as any).student?.name, email: access.invitation_email },
  });

  return res.status(200).json({ ok: true });
}
