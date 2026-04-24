import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlatformOwner } from './owner';

export type BillingReason =
  | 'trial_expired'
  | 'subscription_past_due'
  | 'canceled'
  | 'never_subscribed'
  | 'unknown';

export type BillingCheckResult =
  | { ok: true }
  | { ok: false; reason: BillingReason };

export async function isOrgBillingOk(
  client: SupabaseClient,
  organizationId: string,
): Promise<BillingCheckResult> {
  const { data, error } = await client
    .from('organizations')
    .select('subscription_status, trial_ends_at, current_period_end, owner_user_id')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: 'unknown' };

  // Owner exemption: if this org's owner is the platform owner and exemption
  // is active, skip Stripe checks. Fetched in a second round-trip so RLS on
  // profiles doesn't block the query for non-owner viewers (the join would
  // silently return null then bypass the exemption anyway).
  if (data.owner_user_id) {
    const { data: profile } = await client
      .from('profiles')
      .select('email, billing_exemption_active')
      .eq('id', data.owner_user_id)
      .maybeSingle();
    if (isPlatformOwner(profile?.email) && profile?.billing_exemption_active !== false) {
      return { ok: true };
    }
  }

  const status = data.subscription_status as string | null;
  const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const now = new Date();

  if (status === 'active') return { ok: true };

  if (status === 'trialing') {
    if (trialEnd && trialEnd > now) return { ok: true };
    return { ok: false, reason: 'trial_expired' };
  }

  if (status === 'past_due') return { ok: false, reason: 'subscription_past_due' };
  if (status === 'canceled' || status === 'incomplete_expired' || status === 'unpaid') {
    return { ok: false, reason: 'canceled' };
  }

  return { ok: false, reason: 'unknown' };
}

// ---------------------------------------------------------------------------
// Feature gating by plan tier
// ---------------------------------------------------------------------------

export type PlanTier = 'solo' | 'team' | 'growth';
export type PlanFeature = 'team' | 'tutors' | 'payouts' | 'multi_tutor';

const PLAN_LIMITS: Record<PlanTier, { maxTutors: number }> = {
  solo: { maxTutors: 1 },
  team: { maxTutors: 5 },
  growth: { maxTutors: 15 },
};

export function planAllowsFeature(
  planTier: PlanTier | null | undefined,
  feature: PlanFeature,
): boolean {
  const tier = (planTier ?? 'solo') as PlanTier;
  switch (feature) {
    case 'team':
    case 'tutors':
    case 'payouts':
    case 'multi_tutor':
      return tier === 'team' || tier === 'growth';
    default:
      return false;
  }
}

export function maxTutorsForPlan(planTier: PlanTier | null | undefined): number {
  const tier = (planTier ?? 'solo') as PlanTier;
  return PLAN_LIMITS[tier]?.maxTutors ?? 1;
}

export function daysLeftInTrial(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  if (end <= now) return 0;
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}
