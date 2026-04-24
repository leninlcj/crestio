// Referral conversion + rejection logic. Called from the Stripe webhook —
// NOT exposed as an HTTP endpoint.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  refereeSharesPaymentWithReferrer,
  emailHasPriorStripeSubscription,
  logRejection,
  REFERRAL_DISCOUNT_PERCENT,
  CREDIT_LIFETIME_DAYS,
  ANNUAL_REFERRAL_CAP,
  referralsConvertedThisYear,
  type RejectionReason,
} from './referralValidation';
import { sendEmail } from './email';
import {
  buildReferrerRewardEmail,
  buildRefereeWelcomeEmail,
} from './emails/referral';

type Deps = { admin: SupabaseClient; stripe: Stripe };

// ---------------------------------------------------------------------------
// Called on trial → active transition. Processes one pending conversion
// (if any) for the given referee user id.
// ---------------------------------------------------------------------------
export async function processReferralOnTrialConversion(
  deps: Deps,
  args: {
    refereeUserId: string;
    refereeCustomerId: string;
    refereeMonthlyPriceCents: number;
  },
): Promise<{ handled: boolean; reason?: string; conversionId?: string }> {
  const { admin, stripe } = deps;
  const { refereeUserId, refereeCustomerId, refereeMonthlyPriceCents } = args;

  const { data: conv } = await admin
    .from('referral_conversions')
    .select('id, referrer_user_id, status, code_used')
    .eq('referee_user_id', refereeUserId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!conv) return { handled: false, reason: 'no_pending_referral' };

  const reject = async (reason: RejectionReason, context: Record<string, unknown> = {}) => {
    logRejection(reason, { stage: 'process-conversion', conversionId: conv.id, ...context });
    await admin
      .from('referral_conversions')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', conv.id);
    return { handled: true, reason, conversionId: conv.id };
  };

  // Re-check referrer still active (they may have cancelled since signup).
  const { data: referrerMembership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', conv.referrer_user_id)
    .eq('role', 'owner')
    .maybeSingle();
  if (!referrerMembership) return reject('referrer_not_active', { step: 'membership' });
  const { data: referrerOrg } = await admin
    .from('organizations')
    .select('subscription_status, trial_ends_at, stripe_customer_id, plan_tier, billing_interval')
    .eq('id', referrerMembership.organization_id)
    .maybeSingle();
  if (!referrerOrg) return reject('referrer_not_active', { step: 'org_row' });
  const status = referrerOrg.subscription_status;
  const referrerOk =
    status === 'active' ||
    (status === 'trialing' && referrerOrg.trial_ends_at && new Date(referrerOrg.trial_ends_at) > new Date());
  if (!referrerOk) return reject('referrer_not_active', { status });

  // Annual-cap recheck.
  const converted = await referralsConvertedThisYear(admin, conv.referrer_user_id);
  if (converted >= ANNUAL_REFERRAL_CAP) {
    return reject('referrer_at_annual_cap', { converted });
  }

  // Shared-payment-method check.
  const referrerCustomerId = (referrerOrg.stripe_customer_id ?? null) as string | null;
  const sharedCard = await refereeSharesPaymentWithReferrer(
    stripe, refereeCustomerId, referrerCustomerId,
  );
  if (sharedCard) return reject('shared_payment_method', { refereeCustomerId, referrerCustomerId });

  // Repeat-customer recheck via referee's email.
  const refereeEmail = await emailForCustomer(stripe, refereeCustomerId);
  if (refereeEmail) {
    // Note: at this point the referee IS this customer, so we look for OTHER
    // customers with the same email that had prior subs. emailHasPriorStripeSubscription
    // returns true if ANY customer with that email has a sub — including the
    // current one. We filter out the current customer id.
    try {
      const customers = await stripe.customers.list({ email: refereeEmail, limit: 5 });
      let priorSub = false;
      for (const c of customers.data) {
        if (c.id === refereeCustomerId) continue;
        const subs = await stripe.subscriptions.list({ customer: c.id, limit: 1, status: 'all' });
        if (subs.data.length > 0) { priorSub = true; break; }
      }
      if (priorSub) return reject('repeat_customer', { refereeEmail });
    } catch (e) {
      console.warn('[referral/process-conversion] email prior-sub check failed', e);
    }
  }

  // All checks passed. Compute credits.
  const refereeCreditCents = Math.round((refereeMonthlyPriceCents * REFERRAL_DISCOUNT_PERCENT) / 100);

  const referrerMonthlyPriceCents = await resolveReferrerMonthlyPriceCents(
    stripe, referrerCustomerId,
  );
  const referrerCreditCents = Math.round((referrerMonthlyPriceCents * REFERRAL_DISCOUNT_PERCENT) / 100);

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + CREDIT_LIFETIME_DAYS * 86_400_000).toISOString();

  // Insert credits + flip status together.
  const { error: creditErr } = await admin.from('account_credits').insert([
    {
      user_id: conv.referrer_user_id,
      amount_cents: referrerCreditCents,
      currency: 'AUD',
      source: 'referral_bonus',
      source_reference: conv.id,
      issued_at: nowIso,
      expires_at: expiresIso,
    },
    {
      user_id: refereeUserId,
      amount_cents: refereeCreditCents,
      currency: 'AUD',
      source: 'referral_welcome',
      source_reference: conv.id,
      issued_at: nowIso,
      expires_at: expiresIso,
    },
  ]);
  if (creditErr) {
    console.error('[referral/process-conversion] credit insert failed', creditErr);
    // Don't mark converted — next webhook retry can try again.
    return { handled: false, reason: 'credit_insert_failed' };
  }

  await admin
    .from('referral_conversions')
    .update({ status: 'converted', referee_converted_at: nowIso })
    .eq('id', conv.id);

  // Send notifications. Non-fatal if they fail.
  await sendReferralEmails(admin, {
    referrerUserId: conv.referrer_user_id,
    refereeUserId,
    referrerCreditCents,
    refereeCreditCents,
  });

  return { handled: true, conversionId: conv.id };
}

// ---------------------------------------------------------------------------
// Called on invoice.payment_failed for a referee's first paid invoice.
// Marks their pending referral rejected so no credits are ever issued.
// ---------------------------------------------------------------------------
export async function rejectReferralForPaymentFailure(
  admin: SupabaseClient,
  refereeUserId: string,
): Promise<void> {
  const { data: conv } = await admin
    .from('referral_conversions')
    .select('id, status')
    .eq('referee_user_id', refereeUserId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!conv) return;
  logRejection('payment_failed', { stage: 'invoice-payment-failed', conversionId: conv.id });
  await admin
    .from('referral_conversions')
    .update({ status: 'rejected', rejection_reason: 'payment_failed' })
    .eq('id', conv.id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function emailForCustomer(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const c = await stripe.customers.retrieve(customerId);
    if ('deleted' in c && c.deleted) return null;
    return (c.email ?? '').toLowerCase() || null;
  } catch {
    return null;
  }
}

// Fetch the referrer's active subscription's monthly-equivalent price. If
// they're on annual billing, we normalise to a per-month figure so the 25%
// credit sits against one monthly bill rather than the full annual invoice.
async function resolveReferrerMonthlyPriceCents(
  stripe: Stripe,
  customerId: string | null,
): Promise<number> {
  if (!customerId) return 0;
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' });
    const sub = subs.data[0];
    if (!sub) return 0;
    const item = sub.items.data[0];
    const amount = item?.price?.unit_amount ?? 0;
    const interval = item?.price?.recurring?.interval;
    // Normalise to monthly for display + credit math.
    if (interval === 'year') return Math.round(amount / 12);
    return amount;
  } catch (e) {
    console.error('[referral/process-conversion] could not resolve referrer price', e);
    return 0;
  }
}

async function sendReferralEmails(
  admin: SupabaseClient,
  args: {
    referrerUserId: string;
    refereeUserId: string;
    referrerCreditCents: number;
    refereeCreditCents: number;
  },
): Promise<void> {
  try {
    const [referrerProfile, refereeProfile] = await Promise.all([
      admin.from('profiles').select('email, owner_name').eq('id', args.referrerUserId).maybeSingle(),
      admin.from('profiles').select('email, owner_name').eq('id', args.refereeUserId).maybeSingle(),
    ]);

    if (referrerProfile.data?.email) {
      const refereeFirstName =
        (refereeProfile.data?.owner_name ?? '').trim().split(/\s+/)[0] || null;
      const mail = buildReferrerRewardEmail({
        refereeFirstName,
        creditAmountCents: args.referrerCreditCents,
      });
      await sendEmail({ to: referrerProfile.data.email, ...mail });
    }
    if (refereeProfile.data?.email) {
      const mail = buildRefereeWelcomeEmail({ creditAmountCents: args.refereeCreditCents });
      await sendEmail({ to: refereeProfile.data.email, ...mail });
    }
  } catch (e) {
    console.error('[referral] email delivery failed', e);
  }
}
