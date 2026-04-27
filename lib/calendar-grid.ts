// Math helpers for the day/week calendar grid.
// 60px per hour. Half-hour subgrid = 30px.

export const HOUR_PX = 60;
export const MIN_HOUR = 6;   // 6am — top of the visible default range
export const MAX_HOUR = 23;  // 11pm — bottom

export function gridHeight(minHour = MIN_HOUR, maxHour = MAX_HOUR): number {
  return (maxHour - minHour) * HOUR_PX;
}

export function timeToY(date: Date, dayStart: Date): number {
  const ms = date.getTime() - dayStart.getTime();
  const minutes = ms / 60_000;
  return (minutes / 60) * HOUR_PX;
}

export function durationToHeight(durationMinutes: number): number {
  return Math.max(20, (durationMinutes / 60) * HOUR_PX);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function withHour(d: Date, hour: number, minute = 0): Date {
  const x = new Date(d);
  x.setHours(hour, minute, 0, 0);
  return x;
}

// Snap a Y offset to the nearest 15-minute increment, returning the new
// minutes-from-start-of-day.
export function snapMinutes(y: number, increment = 15): number {
  const minutes = (y / HOUR_PX) * 60;
  return Math.max(0, Math.round(minutes / increment) * increment);
}

// Range used by the visible grid for a given day's sessions. Auto-extends
// outside of MIN/MAX_HOUR if any session falls outside the default range.
export function visibleHourRange(sessions: Array<{ scheduled_at: string; duration_minutes: number }>) {
  let minH = MIN_HOUR;
  let maxH = MAX_HOUR;
  for (const s of sessions) {
    const start = new Date(s.scheduled_at);
    const end = new Date(start.getTime() + (s.duration_minutes ?? 60) * 60_000);
    const startH = start.getHours();
    const endH = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    if (startH < minH) minH = Math.max(0, startH - 1);
    if (endH > maxH) maxH = Math.min(24, endH + 1);
  }
  return { minHour: minH, maxHour: maxH };
}

// Compute X position + width for a session block when sessions overlap.
// We bucket overlapping sessions into "lanes" so they sit side-by-side.
export type LaneAssignment = { laneIndex: number; laneCount: number };

export function assignLanes<T extends { scheduled_at: string; duration_minutes: number; id: string }>(
  sessions: T[],
): Map<string, LaneAssignment> {
  // Sort by start time.
  const sorted = [...sessions].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const map = new Map<string, LaneAssignment>();
  // Build clusters of overlapping sessions; within a cluster, place each
  // event into the lowest-numbered lane that's free.
  type Lane = { endsAt: number };
  let cluster: T[] = [];
  let clusterEnd = 0;

  function flush() {
    if (cluster.length === 0) return;
    const lanes: Lane[] = [];
    const assignments: Array<{ id: string; laneIndex: number }> = [];
    for (const ev of cluster) {
      const start = new Date(ev.scheduled_at).getTime();
      const end = start + (ev.duration_minutes ?? 60) * 60_000;
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i].endsAt <= start) {
          lanes[i] = { endsAt: end };
          assignments.push({ id: ev.id, laneIndex: i });
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push({ endsAt: end });
        assignments.push({ id: ev.id, laneIndex: lanes.length - 1 });
      }
    }
    const laneCount = lanes.length;
    for (const a of assignments) {
      map.set(a.id, { laneIndex: a.laneIndex, laneCount });
    }
    cluster = [];
    clusterEnd = 0;
  }

  for (const ev of sorted) {
    const start = new Date(ev.scheduled_at).getTime();
    const end = start + (ev.duration_minutes ?? 60) * 60_000;
    if (cluster.length === 0 || start < clusterEnd) {
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      flush();
      cluster.push(ev);
      clusterEnd = end;
    }
  }
  flush();
  return map;
}

// Return today's most likely "next session" hour based on past sessions —
// used to render the calendar's empty hint.
export function inferStartHour(history: Array<{ scheduled_at: string }>): number | null {
  if (history.length < 5) return null;
  const counts = new Map<number, number>();
  for (const s of history) {
    const h = new Date(s.scheduled_at).getHours();
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let bestHour = 0;
  let bestCount = 0;
  for (const [h, c] of counts) {
    if (c > bestCount) { bestHour = h; bestCount = c; }
  }
  return bestHour;
}
