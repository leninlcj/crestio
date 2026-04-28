import { useEffect, useState } from 'react';

type Props = {
  studentName: string;
  tutorName: string | null;
  earliestSessionAt: string | null;
  totalSessions: number;
};

const STORAGE_KEY_PREFIX = 'crestio.parent.milestone.shown.v1.';

const MILESTONES: Array<{ days: number; label: string; key: '30' | '90' | '180' | '365' }> = [
  { days: 30, label: 'a month', key: '30' },
  { days: 90, label: 'three months', key: '90' },
  { days: 180, label: 'half a year', key: '180' },
  { days: 365, label: 'a year', key: '365' },
];

export default function MilestoneCard({ studentName, tutorName, earliestSessionAt, totalSessions }: Props) {
  const [milestone, setMilestone] = useState<{ key: string; label: string; days: number } | null>(null);

  useEffect(() => {
    if (!earliestSessionAt) return;
    const earliest = new Date(earliestSessionAt);
    if (Number.isNaN(earliest.getTime())) return;
    const elapsedDays = Math.floor((Date.now() - earliest.getTime()) / 86_400_000);
    const seenKeys = loadSeen(studentName);
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      const m = MILESTONES[i];
      if (elapsedDays >= m.days && !seenKeys.includes(m.key)) {
        setMilestone({ key: m.key, label: m.label, days: m.days });
        return;
      }
    }
  }, [earliestSessionAt, studentName]);

  function dismiss() {
    if (!milestone) return;
    markSeen(studentName, milestone.key);
    setMilestone(null);
  }

  if (!milestone) return null;
  const tutorFirst = (tutorName ?? 'your tutor').split(' ')[0];

  return (
    <div className="rounded-md border border-forest/20 bg-forest-soft/40 p-4 md:p-5 flex items-start gap-3 relative">
      <div className="w-9 h-9 rounded-full bg-forest text-cream grid place-items-center shrink-0" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-0.5">Milestone</div>
        <h3 className="font-display text-base tracking-tightest text-forest-ink m-0 leading-tight">
          {studentName} has been with {tutorFirst} for {milestone.label}.
        </h3>
        <p className="text-2xs text-forest-ink/85 mt-1 leading-relaxed">
          {totalSessions} {totalSessions === 1 ? 'session' : 'sessions'} so far. Quietly impressive.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-forest-ink/50 hover:text-forest-ink p-0.5"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

function loadSeen(studentName: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + studentName);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function markSeen(studentName: string, key: string) {
  if (typeof window === 'undefined') return;
  const seen = loadSeen(studentName);
  if (seen.includes(key)) return;
  seen.push(key);
  try { window.localStorage.setItem(STORAGE_KEY_PREFIX + studentName, JSON.stringify(seen)); } catch { /* */ }
}
