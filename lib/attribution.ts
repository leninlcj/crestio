// Where an enquiry came from. The first public page a visitor lands on
// records the source (UTM tags, a src/ref tag, a Google Ads click, or an
// outside referrer) in sessionStorage; the enquiry form sends it. Without
// this, a family that lands on a suburb page from an ad and then clicks
// through to /enquire would be recorded as "direct".

export const SOURCE_STORAGE_KEY = 'crestio_source';
const MAX = 100;

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function clean(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().replace(/[^a-z0-9._:/ -]/g, '').slice(0, 40);
  return s || null;
}

/**
 * The source implied by a page's URL and referrer, or null when there is
 * nothing to record (a direct visit, or navigation within the site).
 *
 *   ?utm_source=google&utm_medium=cpc&utm_campaign=hsc-maths -> "google/cpc/hsc-maths"
 *   ?gclid=...                                                -> "google/cpc"
 *   ?src=poster                                               -> "poster"
 *   referrer https://www.facebook.com/...                     -> "referrer:www.facebook.com"
 */
export function sourceFromLanding(search: string, referrer: string, siteHost = 'crestio.ai'): string | null {
  const p = new URLSearchParams(search);
  const utmSource = clean(p.get('utm_source'));
  if (utmSource) {
    const parts = [utmSource, clean(p.get('utm_medium')), clean(p.get('utm_campaign'))].filter(Boolean) as string[];
    return parts.join('/').slice(0, MAX);
  }
  const tag = clean(p.get('src')) || clean(p.get('ref'));
  if (tag) return tag;
  if (p.get('gclid')) return 'google/cpc';
  if (p.get('fbclid')) return 'referrer:facebook';
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host && host !== siteHost && !host.endsWith(`.${siteHost}`)) return `referrer:${host}`.slice(0, MAX);
    } catch { /* not a URL */ }
  }
  return null;
}

/** Called once per public page view. Keeps the first source seen in this tab. */
export function rememberSource(win: Pick<Window, 'location' | 'document'>, storage: StorageLike | null): void {
  if (!storage) return;
  try {
    if (storage.getItem(SOURCE_STORAGE_KEY)) return;
    const found = sourceFromLanding(win.location.search, win.document.referrer, 'crestio.ai');
    if (found) storage.setItem(SOURCE_STORAGE_KEY, found);
  } catch { /* storage unavailable: attribution is best-effort */ }
}

/** The source to send with an enquiry: what was remembered, else the current page, else "direct". */
export function currentSource(win: Pick<Window, 'location' | 'document'>, storage: StorageLike | null, lang: 'en' | 'es' = 'en'): string {
  let source: string | null = null;
  try { source = storage?.getItem(SOURCE_STORAGE_KEY) ?? null; } catch { /* ignore */ }
  if (!source) source = sourceFromLanding(win.location.search, win.document.referrer, 'crestio.ai');
  const s = source ?? 'direct';
  return lang === 'es' ? `es:${s}` : s;
}

export function sessionStorageOrNull(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
