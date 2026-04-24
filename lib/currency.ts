import type { SupportedLocale } from './i18n';

// Currency codes accepted by organizations.currency CHECK constraint.
export const SUPPORTED_CURRENCIES = [
  'AUD', 'USD', 'EUR', 'GBP', 'INR', 'CNY', 'BRL', 'MXN',
  'IDR', 'BDT', 'PKR', 'SAR', 'AED', 'JPY', 'CAD', 'NZD',
  'ZAR', 'CHF', 'SGD', 'HKD', 'TWD', 'ARS',
] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export function isSupportedCurrency(x: unknown): x is SupportedCurrency {
  return typeof x === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(x);
}

// ISO country code → invoice currency. Fallback USD for anything we don't list.
const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  AU: 'AUD',
  US: 'USD', CA: 'CAD',
  GB: 'GBP',
  IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  IN: 'INR', PK: 'PKR', BD: 'BDT',
  CN: 'CNY', HK: 'HKD', TW: 'TWD', SG: 'SGD',
  JP: 'JPY',
  BR: 'BRL', MX: 'MXN', AR: 'ARS',
  ID: 'IDR',
  SA: 'SAR', AE: 'AED',
  NZ: 'NZD',
  ZA: 'ZAR',
  CH: 'CHF',
};

export function countryToCurrency(countryCode: string | null | undefined): SupportedCurrency {
  if (!countryCode) return 'USD';
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? 'USD';
}

// ISO country code → preferred UI locale at signup.
const COUNTRY_TO_LOCALE: Record<string, SupportedLocale> = {
  AU: 'en', US: 'en', GB: 'en', CA: 'en', NZ: 'en', IE: 'en', ZA: 'en',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', DO: 'es',
  CN: 'zh', HK: 'zh', TW: 'zh', SG: 'zh',
  IN: 'hi',
  SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', LB: 'ar', MA: 'ar', TN: 'ar',
  FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr',
  BD: 'bn',
  BR: 'pt', PT: 'pt',
  ID: 'id',
  PK: 'ur',
};

export function countryToLocale(countryCode: string | null | undefined): SupportedLocale {
  if (!countryCode) return 'en';
  return COUNTRY_TO_LOCALE[countryCode.toUpperCase()] ?? 'en';
}

// Rough AUD → other rates. Used for pricing-page display only; billing is AUD.
// Keep these approximate; accuracy is not critical for a "~$380 MXN" label.
export const STATIC_EXCHANGE_RATES_FROM_AUD: Record<SupportedCurrency, number> = {
  AUD: 1,
  USD: 0.65,
  EUR: 0.60,
  GBP: 0.52,
  INR: 55,
  CNY: 4.7,
  BRL: 3.3,
  MXN: 13,
  IDR: 10800,
  BDT: 72,
  PKR: 180,
  SAR: 2.45,
  AED: 2.4,
  JPY: 97,
  CAD: 0.89,
  NZD: 1.1,
  ZAR: 12,
  CHF: 0.56,
  SGD: 0.88,
  HKD: 5.1,
  TWD: 20,
  ARS: 600,
};

export function convertAudToCurrency(aud: number, target: SupportedCurrency): number {
  return aud * (STATIC_EXCHANGE_RATES_FROM_AUD[target] ?? 1);
}

// ---------------------------------------------------------------------------
// Intl-based formatters. All pass a locale so currency symbols + grouping
// match the user's region.
// ---------------------------------------------------------------------------

export function formatMoney(
  cents: number | null | undefined,
  currency: string,
  locale: string,
  opts?: { showZero?: boolean; maximumFractionDigits?: number },
): string {
  if (cents === null || cents === undefined) return '—';
  if (cents === 0 && !opts?.showZero) return '—';
  const fractionDigits = opts?.maximumFractionDigits ?? (cents % 100 === 0 ? 0 : 2);
  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: 'currency',
      currency,
      maximumFractionDigits: fractionDigits,
    }).format(cents / 100);
  } catch {
    // Unknown locale fallback.
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      maximumFractionDigits: fractionDigits,
    }).format(cents / 100);
  }
}

export function formatDate(
  iso: string | Date | null | undefined,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString(resolveIntlLocale(locale), opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

export function formatDateTime(
  iso: string | Date | null | undefined,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString(resolveIntlLocale(locale), opts ?? {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

export function formatNumber(
  value: number,
  locale: string,
  opts?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), opts).format(value);
  } catch {
    return String(value);
  }
}

// Maps our short locale code to a fuller Intl tag for region-aware formatting.
// Prefer the user's actual locale if it's already BCP-47; otherwise pick a
// sensible default region.
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

function resolveIntlLocale(locale: string | null | undefined): string {
  const raw = (locale ?? 'en').toLowerCase();
  if (raw.includes('-')) return raw; // already region-tagged
  return INTL_DEFAULTS[raw] ?? raw;
}
