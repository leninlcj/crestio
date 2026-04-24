// Server-only i18n helpers. Import from API routes / server code — never from
// client bundles. `fs` makes this file Node-only.

import fs from 'fs';
import path from 'path';
import { isSupportedLocale } from './i18n';

const FALLBACK = 'en';

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
