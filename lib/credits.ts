// Credit-application helpers.
//
// Strategy: rather than computing partial credits per invoice, we push the
// credit to Stripe's customer balance (a negative amount = reduction). Stripe
// automatically consumes the balance against the customer's next invoice —
// including partial consumption if the invoice total is less than the
// balance. We mark each account_credits row applied once it has been pushed
// to Stripe, and attach the upcoming invoice id for the audit trail.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

type UnappliedCreditRow = {
  id: string;
  amount_cents: number;
  currency: string;
  issued_at: string;
  expires_at: string;
};

// Fetch every unapplied, unexpired credit for a user.
export async function listUnappliedCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<UnappliedCreditRow[]> {
  const { data } = await admin
    .from('account_credits')
    .select('id, amount_cents, currency, issued_at, expires_at')
    .eq('user_id', userId)
    .is('applied_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('issued_at', { ascending: true });
  return (data ?? []) as UnappliedCreditRow[];
}

// Push all unapplied credits for a user to Stripe's customer balance and mark
// them applied. Called from the webhook on invoice.upcoming so the credit
// lands on the next bill.
export async function pushCreditsToStripeBalance(args: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
  stripeCustomerId: string;
  upcomingInvoiceId: string | null;
}): Promise<{ applied: number; totalCents: number }> {
  const { admin, stripe, userId, stripeCustomerId, upcomingInvoiceId } = args;
  const credits = await listUnappliedCredits(admin, userId);
  if (credits.length === 0) return { applied: 0, totalCents: 0 };

  let applied = 0;
  let totalCents = 0;
  const nowIso = new Date().toISOString();

  for (const c of credits) {
    try {
      await stripe.customers.createBalanceTransaction(stripeCustomerId, {
        amount: -c.amount_cents, // negative = reduce what the customer owes
        currency: c.currency.toLowerCase(),
        description: `Crestio credit (${c.id})`,
      });
    } catch (e: any) {
      console.error('[credits] createBalanceTransaction failed', { creditId: c.id, error: e?.message });
      continue;
    }
    await admin
      .from('account_credits')
      .update({ applied_at: nowIso, stripe_invoice_id: upcomingInvoiceId ?? null })
      .eq('id', c.id);
    applied++;
    totalCents += c.amount_cents;
  }
  return { applied, totalCents };
}

// Expire credits that have passed their expires_at. Called opportunistically
// on /api/referrals/me so dashboards show accurate balances.
export async function expireStaleCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await admin
    .from('account_credits')
    .select('id')
    .eq('user_id', userId)
    .is('applied_at', null)
    .lte('expires_at', new Date().toISOString());
  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length === 0) return 0;
  // We don't have a dedicated 'expired' marker column — applied_at NULL +
  // expires_at past is enough. But to remove them from "available" views we
  // leave them as-is and just report the count here; the listUnappliedCredits
  // filter above already excludes expired rows from dashboards and pushes.
  return ids.length;
}
