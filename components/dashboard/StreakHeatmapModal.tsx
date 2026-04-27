import { useEffect } from 'react';
import { buildHeatmap, type StreakDay } from '../../lib/streak';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionDates: string[];
  streakDays: number;
};

export default function StreakHeatmapModal({ open, onClose, sessionDates, streakDays }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const heatmap = buildHeatmap(sessionDates, 30);
  const totalSessions = heatmap.reduce((acc, d) => acc + d.count, 0);
  const activeDays = heatmap.filter((d) => d.count > 0).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-modal-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[calc(100vw-32px)] bg-surface rounded-lg shadow-lift border border-rule p-6 animate-slide-up"
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2 id="streak-modal-title" className="font-display text-lg tracking-tightest text-ink m-0">
            {streakDays > 0 ? `${streakDays} days running` : 'Last 30 days'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-soft hover:text-ink transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
        <p className="text-2xs text-ink-muted mb-5">
          {activeDays} active {activeDays === 1 ? 'day' : 'days'} · {totalSessions} {totalSessions === 1 ? 'session' : 'sessions'}
        </p>

        <div className="grid grid-cols-15 gap-1 mb-4" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
          {heatmap.map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </div>

        <div className="flex items-center justify-between text-2xs text-ink-soft">
          <span>30 days ago</span>
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            <span className="w-3 h-3 rounded-sm bg-ruleSoft" />
            <span className="w-3 h-3 rounded-sm bg-forest/40" />
            <span className="w-3 h-3 rounded-sm bg-forest/70" />
            <span className="w-3 h-3 rounded-sm bg-forest" />
            <span>More</span>
          </div>
          <span>Today</span>
        </div>

        <div className="text-2xs text-ink-soft leading-relaxed mt-5 pt-4 border-t border-rule">
          We don't gamify the streak. It's here so you can see your week at a glance, not so you feel bad about a quiet day.
        </div>
      </div>
    </div>
  );
}

function DayCell({ day }: { day: StreakDay }) {
  const intensity =
    day.count >= 4 ? 'bg-forest' :
    day.count >= 2 ? 'bg-forest/70' :
    day.count >= 1 ? 'bg-forest/40' :
    'bg-ruleSoft';
  return (
    <div
      className={['aspect-square rounded-sm', intensity].join(' ')}
      title={`${day.date}: ${day.count} ${day.count === 1 ? 'session' : 'sessions'}`}
      aria-label={`${day.date}: ${day.count} ${day.count === 1 ? 'session' : 'sessions'}`}
    />
  );
}
