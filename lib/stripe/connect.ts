// Stripe Connect helpers (Express, ONE connected account per organization).
//
// Direct charges live on the connected account; the platform takes an
// application_fee_amount per PaymentIntent. Capabilities (charges_enabled /
// payouts_enabled / requirements) are mirrored onto the org row via webhook.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripe } from '../stripe';

export type OrgConnectRow = {
  id: string;
  name: string;
  stripe_connect_account_id: string | null;
  stripe_connect_status: 'pending' | 'restricted' | 'active' | 'disabled';
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
  stripe_connect_requirements: Record<string, unknown>;
  stripe_connect_country: string;
  stripe_connect_onboarded_at: string | null;
  currency: string | null;
};

export class ConnectError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ConnectError';
  }
}

export async function getOrgWithConnect(
  admin: SupabaseClient,
  orgId: string,
): Promise<OrgConnectRow | null> {
  const { data } = await admin
    .from('organizations')
    .select(
      'id, name, currency, stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_requirements, stripe_connect_country, stripe_connect_onboarded_at',
    )
    .eq('id', orgId)
    .maybeSingle();
  return (data as OrgConnectRow | null) ?? null;
}

// Idempotent: returns the existing account id if the org already has one,
// otherwise creates a new Express account and persists the id.
export async function createConnectAccount(
  admin: SupabaseClient,
  orgId: string,
): Promise<{ accountId: string; created: boolean }> {
  const org = await getOrgWithConnect(admin, orgId);
  if (!org) throw new ConnectError('Organization not found.', 'org_not_found');
  if (org.stripe_connect_account_id) {
    return { accountId: org.stripe_connect_account_id, created: false };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: 'express',
    country: org.stripe_connect_country || 'AU',
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: org.name,
      product_description: 'Tutoring services',
    },
    metadata: { organization_id: orgId },
    settings: {
      payouts: {
        schedule: { interval: 'daily', delay_days: 'minimum' },
      },
    },
  });

  const { error } = await admin
    .from('organizations')
    .update({
      stripe_connect_account_id: account.id,
      stripe_connect_status: 'pending',
    })
    .eq('id', orgId);
  if (error) {
    // Stripe account already exists — leave it for ops cleanup, but surface
    // the persistence error so the caller doesn't think it succeeded.
    throw new ConnectError(`Failed to persist Connect account id: ${error.message}`, 'persist_failed');
  }
  return { accountId: account.id, created: true };
}

export async function getOnboardingLink(
  admin: SupabaseClient,
  orgId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  const { accountId } = await createConnectAccount(admin, orgId);
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
    collect: 'eventually_due',
  });
  return link.url;
}

function deriveStatus(account: Stripe.Account): OrgConnectRow['stripe_connect_status'] {
  const charges = Boolean(account.charges_enabled);
  const payouts = Boolean(account.payouts_enabled);
  const due = account.requirements?.currently_due ?? [];
  const disabled = Boolean(account.requirements?.disabled_reason);
  if (disabled) return 'disabled';
  if (charges && payouts && due.length === 0) return 'active';
  if (charges || payouts) return 'restricted';
  return 'pending';
}

// Pulls the current account state from Stripe, mirrors it onto the org row.
export async function syncConnectAccountStatus(
  admin: SupabaseClient,
  stripeAccountId: string,
): Promise<OrgConnectRow | null> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const status = deriveStatus(account);

  const requirements = (account.requirements ?? {}) as Stripe.Account.Requirements;
  const wasOnboardedAt = (await admin
    .from('organizations')
    .select('id, stripe_connect_onboarded_at')
    .eq('stripe_connect_account_id', stripeAccountId)
    .maybeSingle()).data as { id: string; stripe_connect_onboarded_at: string | null } | null;

  const update: Record<string, unknown> = {
    stripe_connect_status: status,
    stripe_connect_charges_enabled: Boolean(account.charges_enabled),
    stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_connect_requirements: {
      currently_due: requirements.currently_due ?? [],
      eventually_due: requirements.eventually_due ?? [],
      past_due: requirements.past_due ?? [],
      disabled_reason: requirements.disabled_reason ?? null,
    },
  };
  if (status === 'active' && !wasOnboardedAt?.stripe_connect_onboarded_at) {
    update.stripe_connect_onboarded_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from('organizations')
    .update(update)
    .eq('stripe_connect_account_id', stripeAccountId)
    .select(
      'id, name, currency, stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_requirements, stripe_connect_country, stripe_connect_onboarded_at',
    )
    .maybeSingle();
  if (error) throw new ConnectError(`Failed to sync Connect status: ${error.message}`, 'sync_failed');
  return (data as OrgConnectRow | null) ?? null;
}

export async function getConnectedBalance(
  stripeAccountId: string,
): Promise<{ available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] }> {
  const stripe = getStripe();
  const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
  return {
    available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
    pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
  };
}

export async function listConnectedPayouts(
  stripeAccountId: string,
  limit: number,
): Promise<Stripe.Payout[]> {
  const stripe = getStripe();
  const out = await stripe.payouts.list(
    { limit: Math.max(1, Math.min(limit, 100)) },
    { stripeAccount: stripeAccountId },
  );
  return out.data;
}
