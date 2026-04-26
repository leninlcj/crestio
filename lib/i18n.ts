import i18n, {
  type i18n as I18nInstance,
  type Resource,
  createInstance,
} from 'i18next';
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
  'files',
  'households',
  'invoices',
  'legal',
  'lesson_plans',
  'marketing',
  'messages',
  'notifications',
  'onboarding',
  'owner',
  'parent',
  'payouts',
  'sessions',
  'settings',
  'students',
  'tutors',
  'welcome',
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

// Resources passed in from getStaticProps via pageProps._i18n. Pre-loaded at
// build time by lib/i18nServer.ts → serverSideTranslations(). Shape:
//   { [locale]: { [namespace]: parsedJson } }
export type I18nResources = Resource;

const COMMON_INIT_OPTIONS = {
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  fallbackLng: FALLBACK,
  ns: NAMESPACES as unknown as string[],
  defaultNS: 'common',
  load: 'languageOnly',
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
} as const;

// Client-only init for pages that DON'T preload via SSR (e.g. /app routes).
// Uses HttpBackend + LanguageDetector. Idempotent; also a no-op if SSR init
// already populated the singleton.
export function initI18n(): typeof i18n {
  if (initialised || typeof window === 'undefined') return i18n;
  initialised = true;

  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      ...COMMON_INIT_OPTIONS,
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LS_KEY,
        caches: ['localStorage'],
      },
      backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
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

// Synchronous client-side init from SSR-preloaded resources. Runs in _app.tsx
// before the first render so useTranslation has live data on hydration —
// matching what the server emitted. Idempotent: subsequent calls patch in any
// missing resources without re-initialising. Locale is set explicitly (no
// LanguageDetector) so hydration matches the server output; LocaleProvider
// switches to the user's actual locale post-hydration.
export function initI18nFromSsrProps(locale: string, resources: I18nResources): typeof i18n {
  if (typeof window === 'undefined') return i18n;
  if (initialised) {
    for (const lng of Object.keys(resources)) {
      for (const [ns, data] of Object.entries(resources[lng])) {
        if (!i18n.hasResourceBundle(lng, ns)) {
          i18n.addResourceBundle(lng, ns, data, true, false);
        }
      }
    }
    return i18n;
  }
  initialised = true;
  i18n
    .use(HttpBackend)
    .use(initReactI18next)
    .init({
      ...COMMON_INIT_OPTIONS,
      lng: locale,
      resources,
      // Tell i18next the resources are partial — without this it assumes
      // the bundle is complete and won't consult HttpBackend for missing
      // namespaces (e.g. 'sessions' when navigating from / to /app/sessions).
      partialBundledLanguages: true,
      backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    });
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    }
  } catch { /* ignore */ }
  return i18n;
}

// Per-request server instance for SSR/SSG. Each render gets a fresh i18next so
// concurrent requests can't pollute each other's language. Synchronous because
// resources are passed inline (no async backend).
export function createServerI18n(locale: string, resources: I18nResources): I18nInstance {
  const instance = createInstance();
  instance
    .use(initReactI18next)
    .init({
      ...COMMON_INIT_OPTIONS,
      lng: locale,
      resources,
    });
  return instance;
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
