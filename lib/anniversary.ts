// Anniversary milestones — 30 / 90 / 365 days since organization.created_at.
// Tracked via localStorage key so we don't re-fire the same milestone after
// dismiss. Computed client-side only.

export type Anniversary = {
  milestone: 30 | 90 | 365;
  daysSinceCreated: number;
  label: string;            // "30 days", "3 months", "1 year"
};

const STORAGE_KEY = 'crestio.anniversary.shown.v1';

const MILESTONES: Array<{ days: number; label: string; milestone: 30 | 90 | 365 }> = [
  { days: 30, label: '30 days', milestone: 30 },
  { days: 90, label: '3 months', milestone: 90 },
  { days: 365, label: '1 year', milestone: 365 },
];

export function getDueAnniversary(createdAt: string | null | undefined, now: Date = new Date()): Anniversary | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / 86_400_000);
  // Pick the largest milestone the user has crossed but not yet seen.
  const seen = loadShown();
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    const m = MILESTONES[i];
    if (daysSinceCreated >= m.days && !seen.includes(m.milestone)) {
      return { milestone: m.milestone, daysSinceCreated, label: m.label };
    }
  }
  return null;
}

export function markAnniversaryShown(milestone: 30 | 90 | 365) {
  if (typeof window === 'undefined') return;
  const seen = loadShown();
  if (seen.includes(milestone)) return;
  seen.push(milestone);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch { /* ignore */ }
}

function loadShown(): Array<30 | 90 | 365> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => v === 30 || v === 90 || v === 365);
  } catch {
    return [];
  }
}
