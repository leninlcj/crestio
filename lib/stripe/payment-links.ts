// Crestio Payment Links — public URLs per (plan, interval, mode).
//
// URLs in the PAYMENT_LINKS_RAW block are populated by
// /scripts/create-payment-links.ts. Do not hand-edit them — re-run the
// script if you need to (re)create a link.
//
// Mode is selected at runtime via NEXT_PUBLIC_STRIPE_LINK_MODE
// (defaults to 'test' so previews never leak live URLs).
//
// Growth is intentionally absent: it's contact-sales (see lib/plans.ts).

import type { BillingInterval } from '../plans';

export type StripeMode = 'test' | 'live';
export type PayablePlan = 'solo' | 'team';

type ModeConfig = Record<PayablePlan, Record<BillingInterval, string>>;

// --- BEGIN payment-links (auto-generated; do not hand-edit) ---
const PAYMENT_LINKS_RAW: Record<StripeMode, ModeConfig> = {
  test: {
    solo: { monthly: '', annual: '' },
    team: { monthly: '', annual: '' },
  },
  live: {
    solo: { monthly: '', annual: '' },
    team: { monthly: '', annual: '' },
  },
};
// --- END payment-links ---

export function lookupKeyFor(
  tier: PayablePlan,
  interval: BillingInterval,
  mode: StripeMode,
): string {
  return `crestio_pl_${tier}_${interval}_${mode}`;
}

export function currentStripeMode(): StripeMode {
  return process.env.NEXT_PUBLIC_STRIPE_LINK_MODE === 'live' ? 'live' : 'test';
}

export function paymentLinkUrl(
  tier: PayablePlan,
  interval: BillingInterval,
  mode: StripeMode = currentStripeMode(),
): string | null {
  const url = PAYMENT_LINKS_RAW[mode]?.[tier]?.[interval];
  return url && url.length > 0 ? url : null;
}

export function isPayablePlan(tier: string): tier is PayablePlan {
  return tier === 'solo' || tier === 'team';
}
