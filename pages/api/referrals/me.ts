import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  ensureReferralCodeForUser,
  buildShareLink,
} from '../../../lib/referralCode';
import {
  ANNUAL_REFERRAL_CAP,
  referralsConvertedThisYear,
} from '../../../lib/referralValidation';
import { expireStaleCredits } from '../../../lib/credits';
import { getBaseUrl } from '../../../lib/stripe';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Ensure the user has a referral code.
  const code = await ensureReferralCodeForUser(admin, userId);
  const origin = getBaseUrl(req);
  const shareLink = buildShareLink(code, origin);

  // Stats.
  const { data: conversions } = await admin
    .from('referral_conversions')
    .select('id, status, referee_converted_at')
    .eq('referrer_user_id', userId);
  const rows = (conversions ?? []) as Array<{ status: string; referee_converted_at: string | null }>;
  const total_sent = rows.length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const converted = rows.filter((r) => r.status === 'converted').length;
  const rejected = rows.filter((r) => r.status === 'rejected' || r.status === 'expired').length;

  const referralsThisYear = await referralsConvertedThisYear(admin, userId);

  // Credits.
  await expireStaleCredits(admin, userId);
  const { data: credits } = await admin
    .from('account_credits')
    .select('amount_cents, applied_at, expires_at, issued_at')
    .eq('user_id', userId);
  const creditRows = (credits ?? []) as Array<{
    amount_cents: number; applied_at: string | null; expires_at: string; issued_at: string;
  }>;
  const now = new Date();
  const earned = creditRows.reduce((a, c) => a + c.amount_cents, 0);
  const applied = creditRows
    .filter((c) => c.applied_at !== null)
    .reduce((a, c) => a + c.amount_cents, 0);
  const available = creditRows
    .filter((c) => c.applied_at === null && new Date(c.expires_at) > now)
    .reduce((a, c) => a + c.amount_cents, 0);

  return res.status(200).json({
    code,
    share_link: shareLink,
    stats: { total_sent, pending, converted, rejected },
    credits_earned_cents: earned,
    credits_available_cents: available,
    credits_applied_cents: applied,
    credits_pending_next_invoice_cents: available,
    max_referrals_per_year: ANNUAL_REFERRAL_CAP,
    referrals_this_year: referralsThisYear,
    referrals_remaining_this_year: Math.max(0, ANNUAL_REFERRAL_CAP - referralsThisYear),
  });
}
