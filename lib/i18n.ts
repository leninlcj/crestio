import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// Supported locales. Order matches /public/locales/* folders.
export const SUPPORTED_LOCALES = [
  'en',   // English
  'es',   // Español
  'zh',   // 中文 (简体)
  'hi',   // हिन्दी
  'ar',   // العربية
  'fr',   // Français
  'bn',   // বাংলা
  'pt',   // Português
  'id',   // Bahasa Indonesia
  'ur',   // اردو
] as const;

export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_NATIVE_NAME: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
  zh: '中文 (简体)',
  hi: 'हिन्दी',
  ar: 'العربية',
  fr: 'Français',
  bn: 'বাংলা',
  pt: 'Português',
  id: 'Bahasa Indonesia',
  ur: 'اردو',
};

// Full English names fed to AI prompts (so the model picks the right regional
// flavour — Latin-American Spanish, Brazilian Portuguese, etc).
export const LOCALE_AI_NAME: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Spanish (Latin-American conventions unless user is in Spain)',
  zh: 'Simplified Chinese',
  hi: 'Hindi',
  ar: 'Modern Standard Arabic',
  fr: 'French (European conventions)',
  bn: 'Bengali',
  pt: 'Portuguese (Brazilian conventions unless user is in Portugal)',
  id: 'Indonesian',
  ur: 'Urdu',
};

export const RTL_LOCALES: readonly SupportedLocale[] = ['ar', 'ur'];

export const NAMESPACES = [
  'assistant',
  'auth',
  'common',
  'dashboard',
  'emails',
  'errors',
  'invoices',
  'messages',
  'notifications',
  'parent',
  'sessions',
  'students',
] as const;

const FALLBACK: SupportedLocale = 'en';
const LS_KEY = 'crestio.locale';

export function isSupportedLocale(x: unknown): x is SupportedLocale {
  return typeof x === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

export function isRtl(locale: string | null | undefined): boolean {
  return !!locale && (RTL_LOCALES as readonly string[]).includes(locale as SupportedLocale);
}

let initialised = false;
export function initI18n(): typeof i18n {
  if (initialised || typeof window === 'undefined') return i18n;
  initialised = true;

  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      supportedLngs: SUPPORTED_LOCALES as unknown as string[],
      fallbackLng: FALLBACK,
      ns: NAMESPACES as unknown as string[],
      defaultNS: 'common',
      load: 'languageOnly',
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LS_KEY,
        caches: ['localStorage'],
      },
      backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
      react: { useSuspense: false },
    });

  // Mirror initial locale to <html>.
  try {
    const current = (i18n.language || FALLBACK).split('-')[0];
    if (typeof document !== 'undefined') {
      document.documentElement.lang = current;
      document.documentElement.dir = isRtl(current) ? 'rtl' : 'ltr';
    }
  } catch { /* ignore */ }

  return i18n;
}

export function setActiveLocale(locale: string): void {
  if (!isSupportedLocale(locale)) return;
  try { window.localStorage.setItem(LS_KEY, locale); } catch { /* ignore */ }
  i18n.changeLanguage(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }
}

// NOTE: server-side getServerT lives in lib/i18nServer.ts so this file stays
// client-bundle-safe (fs / path aren't available in the browser).

// ---------------------------------------------------------------------------
// Legacy 13A surface kept for compatibility so existing callers don't break.
// ---------------------------------------------------------------------------

export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return FALLBACK;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const base = (raw ?? '').toLowerCase().split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return FALLBACK;
}
