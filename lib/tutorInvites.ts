import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './email';

// Shared by /api/tutors/invite (owner invites by email) and
// /api/owner/tutor-applications/[id]/invite (accept an application).

export type CreateTutorInvitationArgs = {
  admin: SupabaseClient;
  organizationId: string;
  invitedByUserId: string;
  inviterEmail: string;
  email: string;          // already lowercased + trimmed
  orgName?: string | null;
  firstName?: string | null;
};

export type CreateTutorInvitationResult =
  | { ok: true; invitationId: string; acceptUrl: string; emailSent: boolean }
  | { ok: false; error: string; status: number };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function createTutorInvitation(a: CreateTutorInvitationArgs): Promise<CreateTutorInvitationResult> {
  const { admin, organizationId, invitedByUserId, inviterEmail, email } = a;

  // Already a member of this org?
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('user_id, profiles:profiles!organization_members_user_id_fkey(email)')
    .eq('organization_id', organizationId);
  for (const m of (existingMember ?? []) as any[]) {
    if ((m.profiles?.email ?? '').toLowerCase() === email) {
      return { ok: false, status: 400, error: 'This person is already on your team.' };
    }
  }

  // Pending, unexpired invitation?
  const { data: existingInvite } = await admin
    .from('tutor_invitations')
    .select('id, token')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://crestio.ai';
  let invitationId: string;
  let token: string;
  if (existingInvite) {
    invitationId = existingInvite.id as string;
    token = existingInvite.token as string;
  } else {
    token = randomBytes(32).toString('base64url');
    const { data: created, error } = await admin
      .from('tutor_invitations')
      .insert({ organization_id: organizationId, invited_by_user_id: invitedByUserId, email, token })
      .select('id')
      .single();
    if (error || !created) {
      console.error('tutorInvites: insert failed', error);
      return { ok: false, status: 500, error: error?.message ?? 'Could not create invitation.' };
    }
    invitationId = created.id as string;
  }

  let orgName: string = a.orgName ?? '';
  if (!orgName) {
    const { data: org } = await admin.from('organizations').select('name').eq('id', organizationId).single();
    orgName = (org?.name as string | null) ?? 'Crestio';
  }

  const acceptUrl = `${baseUrl}/tutor/accept?token=${token}`;
  const greeting = a.firstName ? `Hi ${a.firstName},\n\n` : '';
  const subject = `You've been invited to join ${orgName} on Crestio`;
  const text =
    greeting +
    `${inviterEmail} has invited you to join ${orgName} as a tutor on Crestio.\n\n` +
    `Accept here: ${acceptUrl}\n\n` +
    `This invitation expires in 7 days.`;
  const html =
    (a.firstName ? `<p>Hi ${escapeHtml(a.firstName)},</p>` : '') +
    `<p>${escapeHtml(inviterEmail)} has invited you to join <strong>${escapeHtml(orgName)}</strong> as a tutor on Crestio.</p>` +
    `<p><a href="${acceptUrl}">Accept invitation</a></p>` +
    `<p style="color:#666;font-size:13px;">This invitation expires in 7 days.</p>`;

  const emailResult = await sendEmail({ to: email, subject, html, text });
  if (!emailResult.success) console.error('tutorInvites: email send failed', emailResult.error);

  return { ok: true, invitationId, acceptUrl, emailSent: emailResult.success };
}
