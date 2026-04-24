// Single source of truth for Crestio's plan catalogue. Prices displayed to
// users are in AUD and match the Stripe products the user creates manually
// (see Session 13A Stripe checklist).

import type { PlanTier } from './billing';

export type BillingInterval = 'monthly' | 'annual';

export type PlanCatalogueEntry = {
  tier: PlanTier;
  label: string;
  pitch: string;
  maxTutors: number;
  trialDays: number;
  prices: {
    monthly: { dollars: number; periodLabel: string; envVar: string };
    annual:  { dollars: number; periodLabel: string; envVar: string };
  };
  features: string[];
  isContactSales?: boolean;
};

export const PLAN_CATALOGUE: Record<PlanTier, PlanCatalogueEntry> = {
  solo: {
    tier: 'solo',
    label: 'Solo',
    pitch: 'For independent tutors',
    maxTutors: 1,
    trialDays: 7,
    prices: {
      monthly: { dollars: 24, periodLabel: '/month', envVar: 'STRIPE_PRICE_SOLO_MONTHLY' },
      annual:  { dollars: 240, periodLabel: '/year', envVar: 'STRIPE_PRICE_SOLO_ANNUAL' },
    },
    features: [
      'Unlimited students',
      'Session logging and notes',
      'AI assistant and note polishing',
      'Lesson plan generation',
      'Invoices and parent portal',
      '7-day free trial',
    ],
  },
  team: {
    tier: 'team',
    label: 'Team',
    pitch: 'For small tutoring teams',
    maxTutors: 5,
    trialDays: 14,
    prices: {
      monthly: { dollars: 59, periodLabel: '/month', envVar: 'STRIPE_PRICE_TEAM_MONTHLY' },
      annual:  { dollars: 590, periodLabel: '/year', envVar: 'STRIPE_PRICE_TEAM_ANNUAL' },
    },
    features: [
      'Everything in Solo',
      'Up to 5 tutors',
      'Per-tutor payouts',
      'Owner + tutor role split',
      '14-day free trial',
    ],
  },
  growth: {
    tier: 'growth',
    label: 'Growth',
    pitch: 'For growing practices',
    maxTutors: 15,
    trialDays: 14,
    prices: {
      monthly: { dollars: 129, periodLabel: '/month', envVar: 'STRIPE_PRICE_GROWTH_MONTHLY' },
      annual:  { dollars: 1290, periodLabel: '/year', envVar: 'STRIPE_PRICE_GROWTH_ANNUAL' },
    },
    features: [
      'Everything in Team',
      'Up to 15 tutors',
      'Priority support',
      'Custom onboarding',
    ],
    isContactSales: true,
  },
};

// Resolve a Stripe price ID from plan tier + interval. Falls back to legacy
// STRIPE_PRICE_ID if the tier-specific env var is unset — this lets Session
// 13A ship before the user has set up all four new Stripe products.
export function priceIdFor(
  tier: PlanTier,
  interval: BillingInterval,
): { priceId: string; envVar: string } | { error: string } {
  const entry = PLAN_CATALOGUE[tier];
  if (!entry) return { error: `Unknown plan tier: ${tier}` };
  if (entry.isContactSales) return { error: 'This plan requires contacting sales.' };
  const envVar = entry.prices[interval].envVar;
  const tierPriceId = process.env[envVar];
  if (tierPriceId) return { priceId: tierPriceId, envVar };
  // Legacy fallback only for solo/monthly (what every current sub uses).
  if (tier === 'solo' && interval === 'monthly') {
    const legacy = process.env.STRIPE_PRICE_ID;
    if (legacy) return { priceId: legacy, envVar: 'STRIPE_PRICE_ID' };
  }
  return { error: `${envVar} is not set.` };
}

// Map a Stripe price ID back to plan tier + interval (for webhook sync).
// Returns null if we can't identify the price.
export function resolvePriceId(priceId: string): { tier: PlanTier; interval: BillingInterval } | null {
  for (const tier of Object.keys(PLAN_CATALOGUE) as PlanTier[]) {
    const entry = PLAN_CATALOGUE[tier];
    for (const interval of ['monthly', 'annual'] as BillingInterval[]) {
      if (process.env[entry.prices[interval].envVar] === priceId) {
        return { tier, interval };
      }
    }
  }
  // Legacy price: solo monthly.
  if (process.env.STRIPE_PRICE_ID === priceId) {
    return { tier: 'solo', interval: 'monthly' };
  }
  return null;
}

export function formatPlanPrice(tier: PlanTier, interval: BillingInterval): string {
  const entry = PLAN_CATALOGUE[tier];
  return `$${entry.prices[interval].dollars} AUD${entry.prices[interval].periodLabel}`;
}
