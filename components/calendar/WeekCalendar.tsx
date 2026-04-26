import { useMemo } from 'react';
import type { CalendarSession } from './types';
import { activeLocale } from '../../lib/utils';

// Week view grid: 7 day-columns × (5am-11pm = 18 rows). Sessions render
// as absolutely-positioned blocks inside their day column.
//
// The `daysToShow` prop lets callers render a 1-day (mobile) or 7-day view
// from the same component. Time range is fixed at 05:00-23:00.

const HOUR_START = 5;
const HOUR_END = 23; // exclusive (so 18 hour rows)
const HOURS = HOUR_END - HOUR_START;
const ROW_HEIGHT_PX = 44; // each hour = 44px
const DAY_LABEL_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' };

type Props = {
  weekStart: Date;          // must be Monday 00:00 local
  daysToShow?: number;      // 1 or 7, default 7
  sessions: CalendarSession[];
  onClickSlot?: (slotStart: Date) => void;
  onClickSession?: (session: CalendarSession) => void;
  studentColors?: Record<string, string>; // student_id → hex
  readOnly?: boolean;       // parent view can't click slots to create
};

const DEFAULT_PALETTE = [
  '#1F3A2E', '#8B4A1F', '#7A2233', '#5C420B', '#3A5F6B', '#614B7C',
];

export function WeekCalendar({
  weekStart,
  daysToShow = 7,
  sessions,
  onClickSlot,
  onClickSession,
  studentColors,
  readOnly,
}: Props) {
  const days: Date[] = useMemo(() => {
    return Array.from({ length: daysToShow }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart, daysToShow]);

  const colorFor = (studentId: string) => {
    if (studentColors && studentColors[studentId]) return studentColors[studentId];
    let hash = 0;
    for (let i = 0; i < studentId.length; i++) hash = (hash * 31 + studentId.charCodeAt(i)) & 0x7fffffff;
    return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length];
  };

  // Bucket sessions by day index (0..daysToShow-1).
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarSession[]>();
    for (const s of sessions) {
      for (let i = 0; i < days.length; i++) {
        const dayStart = new Date(days[i]); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
        const t = new Date(s.scheduled_at).getTime();
        if (t >= dayStart.getTime() && t < dayEnd.getTime()) {
          const arr = map.get(i) ?? [];
          arr.push(s);
          map.set(i, arr);
          break;
        }
      }
    }
    return map;
  }, [sessions, days]);

  function handleSlotClick(dayIdx: number, hour: number) {
    if (readOnly || !onClickSlot) return;
    const d = new Date(days[dayIdx]);
    d.setHours(hour, 0, 0, 0);
    onClickSlot(d);
  }

  const gridCols = `4rem repeat(${daysToShow}, minmax(0, 1fr))`;

  return (
    <div className="border border-rule rounded bg-surface overflow-hidden">
      {/* Header row — day labels */}
      <div
        className="grid border-b border-rule bg-cream"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div />
        {days.map((d, i) => {
          const isToday = sameLocalDay(d, new Date());
          return (
            <div
              key={i}
              className={[
                'text-center py-2 text-2xs uppercase tracking-widest',
                isToday ? 'text-forest font-medium' : 'text-ink-muted',
              ].join(' ')}
            >
              {d.toLocaleDateString(activeLocale(), DAY_LABEL_FMT)}
            </div>
          );
        })}
      </div>

      {/* Body — time rows */}
      <div
        className="grid relative"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Time labels column */}
        <div>
          {Array.from({ length: HOURS }, (_, h) => (
            <div
              key={h}
              className="text-2xs text-ink-soft font-mono text-right pr-2 border-r border-rule"
              style={{ height: `${ROW_HEIGHT_PX}px`, paddingTop: 4 }}
            >
              {formatHour(HOUR_START + h)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => (
          <div key={dayIdx} className="relative border-r border-rule last:border-r-0">
            {Array.from({ length: HOURS }, (_, h) => (
              <div
                key={h}
                onClick={() => handleSlotClick(dayIdx, HOUR_START + h)}
                className={[
                  'border-b border-ruleSoft',
                  readOnly ? '' : 'cursor-pointer hover:bg-ruleSoft/50',
                ].join(' ')}
                style={{ height: `${ROW_HEIGHT_PX}px` }}
              />
            ))}
            {/* Session blocks */}
            {(byDay.get(dayIdx) ?? []).map((s) => {
              const start = new Date(s.scheduled_at);
              const hours = start.getHours() + start.getMinutes() / 60;
              const top = Math.max(0, (hours - HOUR_START) * ROW_HEIGHT_PX);
              const height = Math.max(22, (s.duration_minutes / 60) * ROW_HEIGHT_PX);
              const bg = colorFor(s.student_id);
              const isPending = s.status === 'pending_change';
              const isCancelled = s.status === 'cancelled';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClickSession?.(s); }}
                  className={[
                    'absolute left-1 right-1 rounded text-left px-1.5 py-1 text-[11px] text-white overflow-hidden',
                    'shadow-sm',
                    isCancelled ? 'opacity-50 line-through' : '',
                    isPending ? 'ring-2 ring-amber' : '',
                  ].join(' ')}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    background: bg,
                  }}
                  title={`${s.student_name}${s.subject ? ' · ' + s.subject : ''} · ${start.toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })}`}
                >
                  <div className="font-medium truncate">{s.student_name}</div>
                  {s.subject && height > 32 && (
                    <div className="truncate opacity-90">{s.subject}</div>
                  )}
                  <div className="opacity-80 text-[10px] tabular-nums">
                    {start.toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHour(h: number): string {
  const am = h < 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12} ${am ? 'am' : 'pm'}`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function mondayOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

export default WeekCalendar;
