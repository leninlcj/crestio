// Streak heatmap helpers — derives the last N days of activity from a list
// of session ISO timestamps. The dashboard uses this to render a small
// 30-day strip when the streak pill is opened.

export type StreakDay = {
  date: string;        // YYYY-MM-DD
  count: number;       // sessions logged on this day
};

export function buildHeatmap(sessionDates: string[], daysBack = 30, now: Date = new Date()): StreakDay[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const counts = new Map<string, number>();
  for (const iso of sessionDates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const k = dayKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: StreakDay[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d);
    out.push({ date: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

// Computes the longest streak ending today.
export function longestStreakEndingToday(heatmap: StreakDay[]): number {
  let s = 0;
  for (let i = heatmap.length - 1; i >= 0; i--) {
    if (heatmap[i].count > 0) s++;
    else break;
  }
  return s;
}
