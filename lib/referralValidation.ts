// Anti-abuse checks + conversion-eligibility helpers.
//
// All rejections are logged with prefix `[referral/rejected]` so we can grep
// server logs for patterns without needing an admin UI (Part 8 of spec).

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export const ANNUAL_REFERRAL_CAP = 10;
export const REFERRAL_DISCOUNT_PERCENT = 25;
export const CREDIT_LIFETIME_DAYS = 90;

export type RejectionReason =
  | 'invalid_code'
  | 'self_referral'
  | 'repeat_customer'
  | 'referrer_at_annual_cap'
  | 'referrer_not_active'
  | 'shared_payment_method'
  | 'payment_failed';

export type ReferrerStatus =
  | { ok: true; userId: string; code: string }
  | { ok: false; reason: RejectionReason };

// ---------------------------------------------------------------------------
// Referrer lookup by code — also confirms the referrer still has an active
// or trialing subscription (we won't pay credits to cancelled accounts).
// ---------------------------------------------------------------------------
export async function lookupReferrerByCode(
  admin: SupabaseClient,
  code: string,
): Promise<ReferrerStatus> {
  const { data: row } = await admin
    .from('referral_codes').select('user_id, code').eq('code', code).maybeSingle();
  if (!row) return { ok: false, reason: 'invalid_code' };

  // Confirm referrer's org still has an active/trialing subscription.
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', row.user_id)
    .eq('role', 'owner')
    .maybeSingle();
  if (!membership) return { ok: false, reason: 'referrer_not_active' };

  const { data: org } = await admin
    .from('organizations')
    .select('subscription_status, trial_ends_at')
    .eq('id', membership.organization_id)
    .maybeSingle();
  if (!org) return { ok: false, reason: 'referrer_not_active' };
  const status = org.subscription_status;
  const ok =
    status === 'active' ||
    (status === 'trialing' && org.trial_ends_at && new Date(org.trial_ends_at) > new Date());
  if (!ok) return { ok: false, reason: 'referrer_not_active' };

  return { ok: true, userId: row.user_id, code: row.code };
}

// ---------------------------------------------------------------------------
// Annual-cap check: does this referrer have < 10 converted conversions this
// calendar year? Only 'converted' status counts — pending/rejected don't.
// ---------------------------------------------------------------------------
export async function referralsConvertedThisYear(
  admin: SupabaseClient,
  referrerUserId: string,
): Promise<number> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { count } = await admin
    .from('referral_conversions')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', referrerUserId)
    .eq('status', 'converted')
    .gte('referee_converted_at', yearStart);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Repeat-customer check: a Stripe customer for this email already has any
// subscription history (any status). Used to block trial-farm style abuse.
// ---------------------------------------------------------------------------
export async function emailHasPriorStripeSubscription(
  stripe: Stripe,
  email: string,
): Promise<boolean> {
  if (!email) return false;
  try {
    const customers = await stripe.customers.list({ email, limit: 5 });
    for (const c of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, limit: 1, status: 'all' });
      if (subs.data.length > 0) return true;
    }
    return false;
  } catch (e) {
    console.error('[referral] Stripe customer lookup failed', e);
    // Fail-closed: if we can't tell, treat as prior customer to avoid
    // issuing credits we shouldn't. The caller can decide what to do.
    return true;
  }
}

// ---------------------------------------------------------------------------
// Shared-payment-method check: compare card fingerprints between referee's
// default source and any card the referrer has ever charged against.
// ---------------------------------------------------------------------------
export async function refereeSharesPaymentWithReferrer(
  stripe: Stripe,
  refereeCustomerId: string,
  referrerCustomerId: string | null,
): Promise<boolean> {
  if (!referrerCustomerId) return false;
  try {
    const [refereeCards, referrerCards] = await Promise.all([
      stripe.paymentMethods.list({ customer: refereeCustomerId, type: 'card', limit: 5 }),
      stripe.paymentMethods.list({ customer: referrerCustomerId, type: 'card', limit: 10 }),
    ]);
    const refereeFp = new Set(
      refereeCards.data.map((pm) => pm.card?.fingerprint).filter(Boolean) as string[],
    );
    for (const pm of referrerCards.data) {
      const fp = pm.card?.fingerprint;
      if (fp && refereeFp.has(fp)) return true;
    }
    return false;
  } catch (e) {
    console.error('[referral] card fingerprint compare failed', e);
    // Fail-closed on abuse checks.
    return true;
  }
}

// ---------------------------------------------------------------------------
// Logging — single place so grepping server logs is reliable.
// ---------------------------------------------------------------------------
export function logRejection(
  reason: RejectionReason,
  context: Record<string, unknown>,
): void {
  console.info('[referral/rejected]', reason, JSON.stringify(context));
}
