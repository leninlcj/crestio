// Pure age helper — split out from studentAccess.ts so client bundles don't
// pull in `crypto` via that module's randomBytes import.

export function ageInYears(dobYmd: string | null | undefined, now: Date = new Date()): number | null {
  if (!dobYmd) return null;
  const dob = new Date(`${dobYmd}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}
