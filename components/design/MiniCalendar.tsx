import { useMemo } from 'react';
import { cx } from '../../lib/utils';

type Props = {
  /** Selected date (start of day). */
  value: Date;
  /** Number of days to render — defaults to 14, centered on today. */
  days?: number;
  /** Optional set of YYYY-MM-DD strings — days that have a dot. */
  marked?: Set<string>;
  onChange: (date: Date) => void;
};

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Horizontal pill row of days centered on today. Click a day to jump.
export function MiniCalendar({ value, days = 14, marked, onChange }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedKey = dayKey(value);
  const todayKey = dayKey(today);

  const list = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - Math.floor(days / 2));
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today, days]);

  return (
    <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
      <div className="flex items-center gap-1 min-w-max">
        {list.map((d) => {
          const k = dayKey(d);
          const isSelected = k === selectedKey;
          const isToday = k === todayKey;
          const hasMark = marked?.has(k);
          const dow = d.toLocaleDateString(undefined, { weekday: 'short' });
          const num = d.getDate();
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(startOfDay(d))}
              className={cx(
                'shrink-0 w-12 py-2 text-center rounded-md transition-colors duration-100',
                isSelected
                  ? 'bg-forest text-cream'
                  : isToday
                  ? 'border border-forest/30 text-forest hover:bg-forest-soft'
                  : 'text-ink-muted hover:text-ink hover:bg-ruleSoft',
              )}
              aria-pressed={isSelected}
              aria-label={d.toDateString()}
            >
              <div className={cx('text-2xs uppercase tracking-widest', isSelected ? 'text-cream/70' : isToday ? 'text-forest/70' : 'text-ink-soft')}>
                {dow.slice(0, 2)}
              </div>
              <div className={cx('text-sm font-medium tabular leading-tight mt-0.5', isSelected ? 'text-cream' : isToday ? 'text-forest' : 'text-ink')}>
                {num}
              </div>
              <div className="h-1 mt-0.5 grid place-items-center">
                {hasMark && (
                  <span
                    className={cx(
                      'inline-block w-1 h-1 rounded-full',
                      isSelected ? 'bg-cream/80' : 'bg-forest',
                    )}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MiniCalendar;
