// Canonical formatting layer for the UI (phase 3).
//
// Wraps existing helpers (lib/utils, lib/currency, lib/formatTime) into a
// single, terse API. New code should import from here. Older code keeps
// working through the underlying modules.
//
// All functions are pure and locale-aware via activeLocale() — pass an
// override only when rendering for a specific user (e.g. parent emails).

import { activeLocale } from './utils';

// --- Money ------------------------------------------------------------------

/** Format cents to currency. Hides .00 for whole amounts. $50, not $50.00. */
export function formatMoney(
  cents: number | null | undefined,
  currency: string = 'AUD',
  locale: string = activeLocale(),
): string {
  if (cents === null || cents === undefined) return '—';
  const fractionDigits = cents % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(cents / 100);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(cents / 100);
  }
}

/** Compact currency. $1.2k, $14k, $1.4M. Falls back to formatMoney under $1000. */
export function formatMoneyCompact(
  cents: number | null | undefined,
  currency: string = 'AUD',
  locale: string = activeLocale(),
): string {
  if (cents === null || cents === undefined) return '—';
  if (Math.abs(cents) < 100_000) return formatMoney(cents, currency, locale);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      notation: 'compact', maximumFractionDigits: 1,
    }).format(cents / 100);
  } catch {
    return formatMoney(cents, currency, locale);
  }
}

// --- Duration ---------------------------------------------------------------

/** 45m, 1h, 1h 30m, 2h. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

// --- Dates ------------------------------------------------------------------

/** Today, Yesterday, Tomorrow, weekday, "3 days ago", "2 weeks ago", "May 12". */
export function formatRelativeDate(
  date: string | Date | null | undefined,
  locale: string = activeLocale(),
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (days === 0 || days === 1 || days === -1) return capitalize(rtf.format(days, 'day'));
    if (days > 0 && days <= 6) {
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
    }
    if (days < 0 && days >= -6) return capitalize(rtf.format(days, 'day'));
    if (days < 0 && days >= -13) return capitalize(rtf.format(-1, 'week'));
    if (days < 0 && days >= -29) return capitalize(rtf.format(Math.round(days / 7), 'week'));
    if (days >= 7 && days <= 13) return capitalize(rtf.format(1, 'week'));
  } catch {
    /* fall through */
  }

  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/** Locale-aware time. 4:30 PM in en-US, 16:30 in en-DE. */
export function formatTime(
  date: string | Date | null | undefined,
  locale: string = activeLocale(),
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
}

// --- Phone ------------------------------------------------------------------

/** Light-touch phone formatter — pretty if E.164, raw otherwise. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '—';
  const digits = raw.replace(/[^\d+]/g, '');
  // US/CA: +1XXXXXXXXXX → +1 (XXX) XXX-XXXX
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(digits);
  if (us) return `+1 (${us[1]}) ${us[2]}-${us[3]}`;
  // AU mobile: +614XXXXXXXX → +61 4XX XXX XXX
  const au = /^\+61(\d{1})(\d{3})(\d{3})(\d{3})$/.exec(digits);
  if (au) return `+61 ${au[1]}${au[2]} ${au[3]} ${au[4]}`;
  // Generic E.164 with country code split: +CC ............
  const generic = /^\+(\d{1,3})(\d{4,})$/.exec(digits);
  if (generic) return `+${generic[1]} ${generic[2].replace(/(\d{3})(?=\d)/g, '$1 ')}`;
  return raw;
}

// --- Lists ------------------------------------------------------------------

/** Locale-aware list join: "a, b, and c". */
export function formatList(
  items: string[],
  locale: string = activeLocale(),
  type: 'conjunction' | 'disjunction' = 'conjunction',
): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  try {
    return new (Intl as any).ListFormat(locale, { style: 'long', type }).format(items);
  } catch {
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }
}

// --- Number -----------------------------------------------------------------

/** Whole numbers with grouping. 1,234. */
export function formatCount(n: number | null | undefined, locale: string = activeLocale()): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(locale).format(n);
}

/** "n thing" / "n things" — basic English plural. */
export function pluralize(n: number, singular: string, plural?: string): string {
  return `${formatCount(n)} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

// --- Internal ---------------------------------------------------------------

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
