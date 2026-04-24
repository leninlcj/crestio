// Display-layer time helpers for the Today dashboard and anywhere else that
// needs locale-aware relative / clock-time / full-date formatting.
//
// Every exported function takes an explicit `locale` param. The default is
// still 'en-AU' so existing callers don't break, but the dashboard, batch
// invoice page, and any consumer of useLocaleFormatters should pass the
// user's current UI locale.
//
// Relative strings like "Today", "Tomorrow", "2 days ago" are localised via
// Intl.RelativeTimeFormat — no hardcoded English.

export const DEFAULT_DASHBOARD_TZ = 'Australia/Sydney';
export const DEFAULT_LOCALE = 'en-AU';

// Short locale codes our UI sends ('en', 'es', …) map to richer BCP-47 tags
// for Intl so region-specific formatting (24 vs 12-hour clock, comma vs dot
// decimal) behaves. Duplicated from lib/currency.ts to keep this file
// framework-agnostic.
const INTL_DEFAULTS: Record<string, string> = {
  en: 'en-AU',
  es: 'es-419',
  zh: 'zh-Hans-CN',
  hi: 'hi-IN',
  ar: 'ar-SA',
  fr: 'fr-FR',
  bn: 'bn-BD',
  pt: 'pt-BR',
  id: 'id-ID',
  ur: 'ur-PK',
};

function resolveLocale(locale: string | null | undefined): string {
  const raw = (locale ?? DEFAULT_LOCALE).toLowerCase();
  if (raw.includes('-')) return raw;
  return INTL_DEFAULTS[raw] ?? raw;
}

function dayDelta(targetDate: Date, nowDate: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const a = fmt.format(targetDate);
  const b = fmt.format(nowDate);
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ad2 = Date.UTC(ay, am - 1, ad);
  const bd2 = Date.UTC(by, bm - 1, bd);
  return Math.round((ad2 - bd2) / 86_400_000);
}

// Locale-aware relative-time formatter. Wraps Intl.RelativeTimeFormat with
// graceful fallback.
function relativeTimeFor(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: string,
): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
  } catch {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
  }
}

// "In 12 minutes" / "In 2 hours" / "Today at 3:00 PM" / "Tomorrow at 10:00 AM"
// / "Friday at 3:00 PM" / "24 Apr at 3:00 PM" — all locale-aware.
export function formatRelativeToNow(
  iso: string,
  timezone: string = DEFAULT_DASHBOARD_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const resolved = resolveLocale(locale);

  if (diffMs < 0) return formatDayAndTime(iso, timezone, resolved);
  if (diffMins < 60) return relativeTimeFor(Math.max(1, diffMins), 'minute', resolved);
  if (diffHours <= 6) return relativeTimeFor(Math.max(1, diffHours), 'hour', resolved);

  const delta = dayDelta(target, now, timezone);
  const time = formatTimeOfDay(iso, timezone, resolved);

  // "Today" / "Tomorrow" in user's language, concatenated with localized time.
  // Intl.RelativeTimeFormat(numeric:auto) returns "today", "tomorrow" in
  // lowercase for many locales — sentence case comes from the t() layer.
  if (delta === 0) return composeDayTime(relativeTimeFor(0, 'day', resolved), time, resolved);
  if (delta === 1) return composeDayTime(relativeTimeFor(1, 'day', resolved), time, resolved);
  if (delta >= 2 && delta <= 6) {
    const weekday = new Intl.DateTimeFormat(resolved, { weekday: 'long', timeZone: timezone }).format(target);
    return composeDayTime(weekday, time, resolved);
  }
  return formatDayAndTime(iso, timezone, resolved);
}

// Stitch a "day label" and a "time" with a separator that works across locales.
// Most locales accept " · " cleanly; for RTL we use the same and let CSS dir
// flip it visually.
function composeDayTime(day: string, time: string, _locale: string): string {
  return `${day} · ${time}`;
}

export function formatTimeOfDay(
  iso: string,
  timezone: string = DEFAULT_DASHBOARD_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    hour: 'numeric', minute: '2-digit', timeZone: timezone,
  }).format(new Date(iso));
}

export function formatFullDate(
  date: Date = new Date(),
  timezone: string = DEFAULT_DASHBOARD_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: timezone,
  }).format(date);
}

export function formatDayAndTime(
  iso: string,
  timezone: string = DEFAULT_DASHBOARD_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  const d = new Date(iso);
  const resolved = resolveLocale(locale);
  const date = new Intl.DateTimeFormat(resolved, {
    day: 'numeric', month: 'short', timeZone: timezone,
  }).format(d);
  return composeDayTime(date, formatTimeOfDay(iso, timezone, resolved), resolved);
}

// Relative-only for past/future days: "Today" / "Tomorrow" / "Yesterday" /
// weekday name / "2 days ago" / "24 Apr". Every variant comes from Intl —
// no hardcoded English words.
export function formatRelativeDay(
  iso: string,
  timezone: string = DEFAULT_DASHBOARD_TZ,
  locale: string = DEFAULT_LOCALE,
): string {
  const target = new Date(iso);
  const now = new Date();
  const delta = dayDelta(target, now, timezone);
  const resolved = resolveLocale(locale);
  if (delta === 0 || delta === 1 || delta === -1) {
    return relativeTimeFor(delta, 'day', resolved);
  }
  if (delta > 0 && delta <= 6) {
    return new Intl.DateTimeFormat(resolved, { weekday: 'long', timeZone: timezone }).format(target);
  }
  if (delta < 0 && delta >= -6) {
    return relativeTimeFor(delta, 'day', resolved);
  }
  if (delta < 0 && delta >= -13) {
    // "Last <weekday>" — use RelativeTimeFormat for "last week" phrasing
    // in locales that express it that way, else fall back to weekday name.
    const weekday = new Intl.DateTimeFormat(resolved, { weekday: 'long', timeZone: timezone }).format(target);
    return weekday;
  }
  return new Intl.DateTimeFormat(resolved, {
    day: 'numeric', month: 'short', timeZone: timezone,
  }).format(target);
}

// Returns the "period of day" as a key you can feed to t('greeting.morning')
// etc. The greeting string itself lives in the translation file.
export function timeOfDayPeriod(
  now: Date = new Date(),
  timezone: string = DEFAULT_DASHBOARD_TZ,
): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: timezone,
  }).format(now));
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// Back-compat wrapper: callers that still want the English phrase as a string
// can use this. New UI code should call timeOfDayPeriod() + t().
export function timeOfDayGreeting(
  now: Date = new Date(),
  timezone: string = DEFAULT_DASHBOARD_TZ,
): string {
  const period = timeOfDayPeriod(now, timezone);
  if (period === 'morning') return 'Good morning';
  if (period === 'afternoon') return 'Good afternoon';
  return 'Good evening';
}

export function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}
