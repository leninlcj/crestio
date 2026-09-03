import type { PlanTier } from './billing';

// The agency organisation (owned by the platform owner) is never plan-gated:
// it runs the business, it does not subscribe to it. Everywhere the app asks
// "does this plan allow X?", pass the plan through here first.

export const AGENCY_TIER: PlanTier = 'growth';
export const AGENCY_MAX_TUTORS = 500;

export function effectivePlanTier(planTier: PlanTier | null | undefined, isPlatformOwnerOrg: boolean): PlanTier {
  if (isPlatformOwnerOrg) return AGENCY_TIER;
  return planTier ?? 'solo';
}
