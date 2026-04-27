import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HOUR_PX, gridHeight, timeToY, snapMinutes, visibleHourRange,
  assignLanes, startOfDay, inferStartHour,
} from '../../lib/calendar-grid';
import { CalendarBlock, type CalendarSession } from './CalendarBlock';

type View = 'day' | 'week';

type Props = {
  sessions: CalendarSession[];
  date: Date; // anchor date — for week, the Monday start is derived
  view: View;
  // History to infer most-likely "next session" hour for the empty hint.
  history?: Array<{ scheduled_at: string }>;
  onSessionOpen?: (id: string) => void;
  onSessionRescheduled?: (id: string, newStart: string) => Promise<void> | void;
  onSessionResized?: (id: string, newDurationMin: number) => Promise<void> | void;
  onSlotClick?: (date: Date) => void;
  onContextMenu?: (sessionId: string, e: React.MouseEvent) => void;
  pipelineFor?: (s: CalendarSession) => React.ReactNode;
};

// True calendar grid — day or week view. Drag to reschedule (snap 15min),
// resize bottom edge to change duration. Now-line. Auto-scroll to keep
// now-line visible on initial load.
export function Calendar({
  sessions, date, view,
  history,
  onSessionOpen, onSessionRescheduled, onSessionResized,
  onSlotClick, onContextMenu, pipelineFor,
}: Props) {
  const days = useMemo(() => {
    if (view === 'day') return [startOfDay(date)];
    // Week — derive Monday start.
    const d = new Date(date);
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offset);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday);
      x.setDate(monday.getDate() + i);
      return x;
    });
  }, [date, view]);

  const visible = useMemo(() => visibleHourRange(sessions), [sessions]);
  const totalH = gridHeight(visible.minHour, visible.maxHour);
  const hours = useMemo(() =>
    Array.from({ length: visible.maxHour - visible.minHour }, (_, i) => visible.minHour + i),
  [visible.minHour, visible.maxHour]);

  // Sessions per day.
  const sessionsByDay = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const d of days) m.set(d.toDateString(), []);
    for (const s of sessions) {
      const k = startOfDay(new Date(s.scheduled_at)).toDateString();
      if (m.has(k)) m.get(k)!.push(s);
    }
    return m;
  }, [days, sessions]);

  // Now line.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Scroll-into-view on mount: position now line near 33% of viewport.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    const dayStart = days[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const matchesToday = days.some((d) => d.toDateString() === today.toDateString());
    if (!matchesToday) return;
    const y = timeToY(new Date(now), new Date(dayStart.setHours(visible.minHour, 0, 0, 0)));
    scrollRef.current.scrollTop = Math.max(0, y - scrollRef.current.clientHeight * 0.33);
  // Only on mount and when day changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.toDateString()]);

  // Drag/resize state.
  const [dragging, setDragging] = useState<{
    id: string;
    startY: number;
    originDate: Date;
    pointerStartY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startDuration: number;
    pointerStartY: number;
  } | null>(null);
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);

  function onPointerMove(e: React.PointerEvent) {
    if (dragging) {
      const dy = e.clientY - dragging.pointerStartY;
      const newY = dragging.startY + dy;
      const minutes = snapMinutes(newY);
      setPreviewMinutes(minutes);
    } else if (resizing) {
      const dy = e.clientY - resizing.pointerStartY;
      const newDuration = Math.round((resizing.startDuration + (dy / HOUR_PX) * 60) / 15) * 15;
      setPreviewDuration(Math.max(15, Math.min(240, newDuration)));
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    if (dragging && previewMinutes != null) {
      const target = sessions.find((s) => s.id === dragging.id);
      if (target) {
        const newStart = new Date(dragging.originDate);
        newStart.setHours(0, 0, 0, 0);
        newStart.setMinutes(previewMinutes);
        try { await onSessionRescheduled?.(dragging.id, newStart.toISOString()); } catch { /* */ }
      }
    }
    if (resizing && previewDuration != null) {
      try { await onSessionResized?.(resizing.id, previewDuration); } catch { /* */ }
    }
    setDragging(null);
    setResizing(null);
    setPreviewMinutes(null);
    setPreviewDuration(null);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  // Cancel on Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDragging(null);
        setResizing(null);
        setPreviewMinutes(null);
        setPreviewDuration(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click on empty grid → open new session pre-filled at the clicked time.
  function onGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    if (dragging || resizing) return;
    if (!onSlotClick) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = snapMinutes(y) + visible.minHour * 60;
    const target_date = new Date(day);
    target_date.setHours(0, minutes, 0, 0);
    onSlotClick(target_date);
  }

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  const inferredHour = inferStartHour(history ?? []);

  return (
    <div
      className="card overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Day header row when in week view */}
      {view === 'week' && (
        <div className="grid border-b border-rule" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d.toDateString()} className="px-2 py-2 text-center border-l border-ruleSoft">
              <div className="text-2xs uppercase tracking-widest text-ink-muted">
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              <div className={[
                'text-sm font-medium tabular num',
                isToday(d) ? 'text-forest' : 'text-ink',
              ].join(' ')}>
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 'min(720px, 70vh)' }}>
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
            height: totalH,
          }}
        >
          {/* Hour gutter */}
          <div className="relative">
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 text-2xs text-ink-soft num tabular text-right"
                style={{ top: i * HOUR_PX - 6, width: '38px' }}
              >
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const dayStart = new Date(day);
            dayStart.setHours(visible.minHour, 0, 0, 0);
            const daySessions = sessionsByDay.get(day.toDateString()) ?? [];
            const lanes = assignLanes(daySessions);
            const showNow = isToday(day);
            const nowDate = new Date(now);
            const nowY = showNow ? timeToY(nowDate, dayStart) : -1;

            return (
              <div
                key={day.toDateString()}
                onClick={(e) => onGridClick(day, e)}
                className={[
                  'relative border-l border-ruleSoft',
                  di === 0 && view === 'day' ? 'border-l-0' : '',
                ].join(' ')}
              >
                {/* Hour rules */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-rule/70"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}
                {/* Half-hour subgrid */}
                {hours.map((h, i) => (
                  <div
                    key={`${h}-half`}
                    className="absolute left-0 right-0 border-t border-rule/30"
                    style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                  />
                ))}

                {/* Empty hint at most-likely start hour */}
                {daySessions.length === 0 && inferredHour != null && isToday(day) && (
                  <div
                    className="absolute left-1 right-1 border border-dashed border-forest/30 rounded-md px-2 py-1 text-2xs text-forest/70 cursor-pointer hover:bg-forest-soft/20"
                    style={{
                      top: (inferredHour - visible.minHour) * HOUR_PX,
                      height: HOUR_PX,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const slot = new Date(day);
                      slot.setHours(inferredHour, 0, 0, 0);
                      onSlotClick?.(slot);
                    }}
                  >
                    Most days you start around here
                  </div>
                )}

                {/* Session blocks */}
                {daySessions.map((s) => {
                  const lane = lanes.get(s.id) ?? { laneIndex: 0, laneCount: 1 };
                  const isDrag = dragging?.id === s.id;
                  const isRes = resizing?.id === s.id;
                  const ghostBlock = isDrag && previewMinutes != null;

                  // While dragging: render the ghost at the original location
                  // and the block at the preview location.
                  let blockSession = s;
                  if (isDrag && previewMinutes != null) {
                    const newStart = new Date(day);
                    newStart.setHours(0, previewMinutes, 0, 0);
                    blockSession = { ...s, scheduled_at: newStart.toISOString() };
                  }
                  if (isRes && previewDuration != null) {
                    blockSession = { ...blockSession, duration_minutes: previewDuration };
                  }

                  return (
                    <div key={s.id}>
                      {ghostBlock && (
                        <CalendarBlock
                          session={s}
                          dayStart={dayStart}
                          laneIndex={lane.laneIndex}
                          laneCount={lane.laneCount}
                          ghost
                        />
                      )}
                      <CalendarBlock
                        session={blockSession}
                        dayStart={dayStart}
                        laneIndex={lane.laneIndex}
                        laneCount={lane.laneCount}
                        isDragging={isDrag}
                        isResizing={isRes}
                        onClick={() => onSessionOpen?.(s.id)}
                        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(s.id, e); }}
                        pipeline={pipelineFor?.(s)}
                        onDragStart={(e) => {
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                          setDragging({
                            id: s.id,
                            startY: timeToY(new Date(s.scheduled_at), dayStart),
                            originDate: day,
                            pointerStartY: e.clientY,
                          });
                        }}
                        onResizeStart={(e) => {
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                          setResizing({
                            id: s.id,
                            startDuration: s.duration_minutes,
                            pointerStartY: e.clientY,
                          });
                        }}
                      />
                    </div>
                  );
                })}

                {/* Now line */}
                {showNow && nowY >= 0 && nowY <= totalH && (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowY }}>
                    <div className="relative">
                      <span className="absolute -left-1 -top-1.5 inline-block w-2.5 h-2.5 rounded-full bg-forest session-now-pulse" />
                      <div className="h-px bg-forest/80" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fmtHour(h: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${period}`;
}

export default Calendar;
