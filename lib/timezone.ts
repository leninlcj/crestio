// Timezone helpers for session scheduling. We store scheduled_at as UTC
// (TIMESTAMPTZ) but templates are defined in a local timezone + day-of-week
// + clock-time. This module handles the conversion both ways.

export const DEFAULT_TIMEZONE = 'Australia/Sydney';

// ---------------------------------------------------------------------------
// Parse a "HH:MM:SS" or "HH:MM" string into {hours, minutes, seconds}.
// ---------------------------------------------------------------------------
export function parseTimeOfDay(raw: string): { hours: number; minutes: number; seconds: number } {
  const parts = raw.split(':');
  return {
    hours: Number(parts[0] ?? 0),
    minutes: Number(parts[1] ?? 0),
    seconds: Number(parts[2] ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Build a UTC Date from (localDate, localTime, timezone) — the inverse of
// "what UTC instant does this local wall-clock time correspond to?"
//
// We compute the offset for the target timezone at that instant using
// Intl.DateTimeFormat, then shift.
// ---------------------------------------------------------------------------
export function localDateTimeToUtcIso(args: {
  dateIso: string;   // YYYY-MM-DD
  timeOfDay: string; // HH:MM or HH:MM:SS
  timezone: string;
}): string {
  const { dateIso, timeOfDay, timezone } = args;
  const { hours, minutes } = parseTimeOfDay(timeOfDay);
  const [y, m, d] = dateIso.split('-').map(Number);

  // First attempt: treat the local clock time as if it were UTC, then adjust
  // by the target timezone's offset at that instant.
  const naive = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, hours, minutes, 0));
  const offsetMs = tzOffsetAt(naive, timezone);
  return new Date(naive.getTime() - offsetMs).toISOString();
}

// Return the target timezone's offset from UTC in ms at the given instant.
// Positive = timezone is ahead of UTC (e.g. Sydney AEST = +10h = +36_000_000).
function tzOffsetAt(instant: Date, timezone: string): number {
  // Get the timezone's current "wall clock" at this instant using Intl.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const localEpoch = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    // Intl sometimes reports "24" for midnight; treat as 0.
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'), get('second'),
  );
  return localEpoch - instant.getTime();
}

// ---------------------------------------------------------------------------
// Get the YYYY-MM-DD representation of an instant in a specific timezone.
// ---------------------------------------------------------------------------
export function localDateInTz(instant: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return dtf.format(instant); // en-CA gives YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// What day of the week (0=Sun..6=Sat) is `instant` in `timezone`?
// ---------------------------------------------------------------------------
export function dayOfWeekInTz(instant: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short',
  }).format(instant);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

// ---------------------------------------------------------------------------
// Add N days to a YYYY-MM-DD string and return a new YYYY-MM-DD.
// ---------------------------------------------------------------------------
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Find the next occurrence of (dayOfWeek) on-or-after (fromDateIso) in a
// specific timezone. Returns YYYY-MM-DD.
// ---------------------------------------------------------------------------
export function nextWeekdayOnOrAfter(
  fromDateIso: string,
  targetDow: number,
  timezone: string,
): string {
  let cursor = fromDateIso;
  for (let i = 0; i < 7; i++) {
    // Compute the "midday" instant in the target timezone for this date,
    // then check its day-of-week. Midday avoids DST edge cases.
    const iso = localDateTimeToUtcIso({ dateIso: cursor, timeOfDay: '12:00', timezone });
    const dow = dayOfWeekInTz(new Date(iso), timezone);
    if (dow === targetDow) return cursor;
    cursor = addDaysIso(cursor, 1);
  }
  return fromDateIso;
}
