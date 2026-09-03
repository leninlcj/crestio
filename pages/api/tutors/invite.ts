import type { NextApiRequest, NextApiResponse } from 'next';
import { isPlatformOwner } from '../../../lib/owner';
import { effectivePlanTier, AGENCY_MAX_TUTORS } from '../../../lib/agencyPlan';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendEmail } from '../../../lib/email';
import { planAllowsFeature, maxTutorsForPlan, type PlanTier } from '../../../lib/billing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const callerId = userData.user.id;
  const callerEmail = (userData.user.email ?? '').toLowerCase();
  if (!callerEmail) return res.status(400).json({ error: 'Your account has no email.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Caller must be an owner of an organization.
  const { data: ownership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', callerId)
    .eq('role', 'owner')
    .maybeSingle();
  if (!ownership) {
    return res.status(403).json({ error: 'Only owners can invite tutors.' });
  }
  const organizationId = ownership.organization_id;

  // Plan gating: Solo cannot invite tutors. Team/Growth have seat caps.
  const { data: orgRow } = await admin
    .from('organizations')
    .select('plan_tier')
    .eq('id', organizationId)
    .maybeSingle();
  // The agency organisation (platform owner) is never plan-gated.
  const agencyOrg = isPlatformOwner(callerEmail);
  const planTier = effectivePlanTier((orgRow?.plan_tier as PlanTier | null) ?? 'solo', agencyOrg);
  if (!planAllowsFeature(planTier, 'multi_tutor')) {
    return res.status(403).json({
      error: 'Upgrade to Crestio Team to invite tutors.',
      upgrade_required: true,
    });
  }
  // Count existing + pending.
  const { count: tutorCount } = await admin
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'tutor');
  const { count: pendingCount } = await admin
    .from('tutor_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());
  const seatsUsed = (tutorCount ?? 0) + (pendingCount ?? 0);
  const seatCap = agencyOrg ? AGENCY_MAX_TUTORS : maxTutorsForPlan(planTier);
  if (seatsUsed >= seatCap) {
    return res.status(403).json({
      error: `Your ${planTier} plan supports up to ${seatCap} tutor${seatCap === 1 ? '' : 's'}. Upgrade to add more.`,
      upgrade_required: true,
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const email = rawEmail.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  // Block: self-invite.
  if (email === callerEmail) {
    return res.status(400).json({ error: 'You are already an owner of this organization.' });
  }

  // Block: already a member of this org.
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('user_id, profiles:profiles!organization_members_user_id_fkey(email)')
    .eq('organization_id', organizationId);
  if (existingMember) {
    for (const m of existingMember as any[]) {
      const memberEmail = (m.profiles?.email ?? '').toLowerCase();
      if (memberEmail === email) {
        return res.status(400).json({ error: 'This person is already on your team.' });
      }
    }
  }

  // Block: pending non-expired non-revoked invitation for this email+org.
  const { data: existingInvite } = await admin
    .from('tutor_invitations')
    .select('id, expires_at')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (existingInvite) {
    return res.status(400).json({ error: 'An invitation to this email is still pending.' });
  }

  // Generate token and insert.
  const invitationToken = randomBytes(32).toString('base64url');
  const { data: created, error: insertErr } = await admin
    .from('tutor_invitations')
    .insert({
      organization_id: organizationId,
      invited_by_user_id: callerId,
      email,
      token: invitationToken,
    })
    .select('id')
    .single();
  if (insertErr || !created) {
    console.error('tutors/invite: insert failed', insertErr);
    return res.status(500).json({ error: insertErr?.message ?? 'Could not create invitation.' });
  }

  // Fetch org name for email body.
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single();
  const orgName = org?.name ?? 'Crestio';

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://crestio.ai';
  const acceptUrl = `${baseUrl}/tutor/accept?token=${invitationToken}`;

  const subject = `You've been invited to join ${orgName} on Crestio`;
  const text =
    `${callerEmail} has invited you to join ${orgName} as a tutor on Crestio.\n\n` +
    `Click here to accept: ${acceptUrl}\n\n` +
    `This invitation expires in 7 days.`;
  const html = `<p>${escapeHtml(callerEmail)} has invited you to join <strong>${escapeHtml(orgName)}</strong> as a tutor on Crestio.</p>` +
    `<p><a href="${acceptUrl}">Accept invitation</a></p>` +
    `<p style="color:#666;font-size:13px;">This invitation expires in 7 days.</p>`;

  const emailResult = await sendEmail({ to: email, subject, html, text });
  if (!emailResult.success) {
    console.error('tutors/invite: email send failed', emailResult.error);
  }

  // Return the accept URL so the UI can offer a "Copy link" fallback when the
  // email failed (or just generally — owners sometimes prefer to DM the link).
  return res.status(200).json({
    ok: true,
    invitation_id: created.id,
    email_sent: emailResult.success,
    accept_url: acceptUrl,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
