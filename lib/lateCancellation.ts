import { AGENCY } from './agency';

export const LATE_CANCEL_HOURS = AGENCY.policies.cancellationHours;

/**
 * A family cancellation is "late" when it lands inside the notice window
 * before the scheduled start. Tutor and agency cancellations are never
 * charged, so they are never late.
 */
export function isLateCancellation(scheduledAtIso: string, cancelledBy: 'family' | 'tutor' | 'agency', now: Date = new Date()): boolean {
  if (cancelledBy !== 'family') return false;
  const start = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(start)) return false;
  const hoursAhead = (start - now.getTime()) / 3_600_000;
  return hoursAhead < LATE_CANCEL_HOURS;
}
