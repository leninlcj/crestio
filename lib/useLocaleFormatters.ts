import { useMemo } from 'react';
import { useLocale } from './localeContext';
import {
  formatMoney as baseFormatMoney,
  formatDate as baseFormatDate,
  formatDateTime as baseFormatDateTime,
  formatNumber as baseFormatNumber,
} from './currency';
import {
  formatRelativeToNow,
  formatRelativeDay,
  formatTimeOfDay,
  formatFullDate,
  formatDayAndTime,
  DEFAULT_DASHBOARD_TZ,
} from './formatTime';

// Locale-aware formatters bound to the user's current UI locale. Use this
// hook in any component that renders dates, times, numbers, or money.
//
//   const { formatDate, formatMoney, formatRelative } = useLocaleFormatters();
//   formatDate('2026-04-24');              // "24 abr 2026" in es
//   formatMoney(24000, 'USD');             // "$240" in en, "240 US$" in es
//   formatRelative('2026-04-25T10:00:00Z') // "mañana · 10:00" in es
export function useLocaleFormatters(timezone: string = DEFAULT_DASHBOARD_TZ) {
  const { locale } = useLocale();

  return useMemo(() => ({
    locale,
    formatMoney: (cents: number | null | undefined, currency: string, opts?: { showZero?: boolean; maximumFractionDigits?: number }) =>
      baseFormatMoney(cents, currency, locale, opts),
    formatDate: (iso: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
      baseFormatDate(iso, locale, opts),
    formatDateTime: (iso: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
      baseFormatDateTime(iso, locale, opts),
    formatNumber: (value: number, opts?: Intl.NumberFormatOptions) =>
      baseFormatNumber(value, locale, opts),
    formatRelative: (iso: string) => formatRelativeToNow(iso, timezone, locale),
    formatRelativeDay: (iso: string) => formatRelativeDay(iso, timezone, locale),
    formatTimeOfDay: (iso: string) => formatTimeOfDay(iso, timezone, locale),
    formatFullDate: (date: Date = new Date()) => formatFullDate(date, timezone, locale),
    formatDayAndTime: (iso: string) => formatDayAndTime(iso, timezone, locale),
  }), [locale, timezone]);
}
