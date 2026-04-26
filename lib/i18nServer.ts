// Server-only i18n helpers. Import from API routes / server code — never from
// client bundles. `fs` makes this file Node-only.

import fs from 'fs';
import path from 'path';
import type { ResourceLanguage } from 'i18next';
import { isSupportedLocale, type I18nResources } from './i18n';

const FALLBACK = 'en';

function loadNamespace(locale: string, namespace: string): ResourceLanguage[string] {
  try {
    const p = path.join(process.cwd(), 'public', 'locales', locale, `${namespace}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// Used by getStaticProps/getServerSideProps to ship pre-loaded translation
// bundles to the client. Spread the result into props so _app.tsx finds it as
// pageProps._i18n and inits i18next synchronously before first render — no
// raw keys ever ship in SSR HTML, and no flicker on hydration.
//
// Always includes the English fallback alongside the requested locale so any
// missing key still renders cleanly via i18next's fallbackLng chain.
export function serverSideTranslations(
  locale: string | undefined,
  namespaces: readonly string[],
): { _i18n: { locale: string; resources: I18nResources } } {
  const lng = isSupportedLocale(locale) ? locale : FALLBACK;
  const langs = lng === FALLBACK ? [FALLBACK] : [lng, FALLBACK];
  const resources: I18nResources = {};
  for (const l of langs) {
    const bundle: ResourceLanguage = {};
    for (const n of namespaces) bundle[n] = loadNamespace(l, n);
    resources[l] = bundle;
  }
  return { _i18n: { locale: lng, resources } };
}

// Returns a fixed-locale t() for the given namespace. Loads the matching
// /public/locales/<lng>/<ns>.json synchronously; falls back to English per key.
export async function getServerT(
  locale: string,
  namespace: string,
): Promise<(key: string, vars?: Record<string, unknown>) => string> {
  const pick = isSupportedLocale(locale) ? locale : FALLBACK;
  function load(lng: string): Record<string, any> {
    try {
      const p = path.join(process.cwd(), 'public', 'locales', lng, `${namespace}.json`);
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return {};
    }
  }
  const primary = load(pick);
  const fallback = pick === FALLBACK ? {} : load(FALLBACK);

  function interpolate(template: string, vars?: Record<string, unknown>): string {
    if (!vars) return template;
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => String(vars[k] ?? ''));
  }

  return (key: string, vars?: Record<string, unknown>) => {
    const keys = key.split('.');
    let value: any = primary;
    for (const k of keys) value = value?.[k];
    if (typeof value !== 'string') {
      value = fallback;
      for (const k of keys) value = value?.[k];
    }
    if (typeof value !== 'string') return key;
    return interpolate(value, vars);
  };
}
