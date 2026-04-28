import Link from 'next/link';
import { useMemo } from 'react';

type Session = { scheduled_at: string };

type Props = {
  sessionsThisWeek: Session[];
};

export default function TutorWeekStrip({ sessionsThisWeek }: Props) {
  const days = useMemo(() => buildWeek(sessionsThisWeek), [sessionsThisWeek]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section className="rounded-md border border-rule bg-surface p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft">This week</h2>
        <Link href="/parent/calendar" className="text-2xs text-forest hover:underline">View calendar →</Link>
      </div>
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {days.map((day) => {
          const isToday = day.date.getTime() === today.getTime();
          const isPast = day.date.getTime() < today.getTime();
          const dayLabel = day.date.toLocaleDateString('en-AU', { weekday: 'narrow' });
          const dateLabel = day.date.getDate();

          return (
            <Link
              key={day.date.toISOString()}
              href={`/parent/calendar?date=${day.date.toISOString().slice(0, 10)}`}
              className={[
                'flex flex-col items-center rounded-md border py-2 px-1 transition-colors',
                isToday ? 'border-forest bg-forest-soft' : 'border-rule hover:border-ink-soft',
              ].join(' ')}
              aria-label={`${day.date.toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric' })}: ${day.sessionCount} ${day.sessionCount === 1 ? 'session' : 'sessions'}`}
            >
              <span className={['text-[10px] uppercase tracking-widest font-medium', isToday ? 'text-forest' : 'text-ink-soft'].join(' ')}>
                {dayLabel}
              </span>
              <span className={['font-display text-sm md:text-base tracking-tightest tabular-nums leading-none mt-0.5', isToday ? 'text-forest-ink' : isPast ? 'text-ink-soft' : 'text-ink'].join(' ')}>
                {dateLabel}
              </span>
              <span
                className={[
                  'mt-2 w-1.5 h-1.5 rounded-full',
                  day.sessionCount > 0 ? 'bg-forest' : 'bg-rule',
                ].join(' ')}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function buildWeek(sessions: Session[]): Array<{ date: Date; sessionCount: number }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  const out: Array<{ date: Date; sessionCount: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const count = sessions.filter((s) => {
      const t = new Date(s.scheduled_at).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).length;
    out.push({ date: d, sessionCount: count });
  }
  return out;
}
