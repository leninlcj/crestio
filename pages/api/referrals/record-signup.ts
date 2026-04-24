import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../lib/stripe';
import { normaliseCode, isWellFormedCode } from '../../../lib/referralCode';
import {
  lookupReferrerByCode,
  referralsConvertedThisYear,
  emailHasPriorStripeSubscription,
  ANNUAL_REFERRAL_CAP,
  logRejection,
  type RejectionReason,
} from '../../../lib/referralValidation';

// Called by the signup page right after Supabase auth.signUp succeeds.
// Auth'd with the brand-new user's token so we can verify identity. Server
// uses service-role for the actual writes.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const newUserId = userData.user.id;
  const newUserEmail = (userData.user.email ?? '').toLowerCase();

  const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
  const code = normaliseCode(rawCode);
  if (!code || !isWellFormedCode(code)) {
    return res.status(200).json({ recorded: false, reason: 'invalid_code' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Already recorded for this user? (second signup attempt, tab refresh, etc.)
  const { data: existing } = await admin
    .from('referral_conversions')
    .select('id, status')
    .eq('referee_user_id', newUserId)
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ recorded: false, reason: 'already_recorded', conversion_id: existing.id });
  }

  const referrer = await lookupReferrerByCode(admin, code);
  if (!referrer.ok) {
    logRejection(referrer.reason, { stage: 'record-signup', code, newUserId });
    return res.status(200).json({ recorded: false, reason: referrer.reason });
  }

  // Self-referral guard (shouldn't happen — a user can't sign up with their
  // own code because they're already signed in — but defend anyway).
  if (referrer.userId === newUserId) {
    const reason: RejectionReason = 'self_referral';
    logRejection(reason, { stage: 'record-signup', code, newUserId });
    return res.status(200).json({ recorded: false, reason });
  }

  // Annual-cap check.
  const converted = await referralsConvertedThisYear(admin, referrer.userId);
  if (converted >= ANNUAL_REFERRAL_CAP) {
    const reason: RejectionReason = 'referrer_at_annual_cap';
    logRejection(reason, { stage: 'record-signup', code, referrerUserId: referrer.userId, converted });
    return res.status(200).json({ recorded: false, reason });
  }

  // Repeat-customer check (Stripe-side). We do this here so a signup that
  // would never convert anyway doesn't create a pending row that clutters
  // the dashboard — though it's also re-checked at conversion time.
  try {
    const stripe = getStripe();
    const priorSub = await emailHasPriorStripeSubscription(stripe, newUserEmail);
    if (priorSub) {
      const reason: RejectionReason = 'repeat_customer';
      logRejection(reason, { stage: 'record-signup', code, newUserId, email: newUserEmail });
      return res.status(200).json({ recorded: false, reason });
    }
  } catch {
    // If Stripe is unavailable, fall through — the webhook will re-check.
  }

  // Resolve organizations (new signup trigger has already created theirs).
  const [{ data: referrerMembership }, { data: refereeMembership }] = await Promise.all([
    admin.from('organization_members').select('organization_id').eq('user_id', referrer.userId).maybeSingle(),
    admin.from('organization_members').select('organization_id').eq('user_id', newUserId).maybeSingle(),
  ]);

  const { data: inserted, error: insertErr } = await admin
    .from('referral_conversions')
    .insert({
      referrer_user_id: referrer.userId,
      referee_user_id: newUserId,
      referrer_org_id: referrerMembership?.organization_id ?? null,
      referee_org_id: refereeMembership?.organization_id ?? null,
      code_used: code,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (insertErr || !inserted) {
    console.error('[referral/record-signup] insert failed', insertErr);
    return res.status(500).json({ error: 'Could not record referral.' });
  }

  return res.status(200).json({ recorded: true, conversion_id: inserted.id });
}
