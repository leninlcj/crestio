/* eslint-disable no-console */
/**
 * translate-locales.ts
 *
 * Reads every JSON file under /public/locales/en/*.json and translates each
 * string value into the 9 non-English target locales via DeepL's API. Writes
 * the result to /public/locales/<locale>/<namespace>.json.
 *
 * Features:
 * - Per-string context hints (public/locales/en/_contexts.json)
 * - Placeholder preservation ({{var}} is wrapped in <x/> tags so DeepL skips)
 * - Translation cache (public/locales/.cache/translations.json) — re-runs
 *   only touch new or changed strings.
 * - Manual overrides: public/locales/<locale>/_overrides.json takes precedence
 *   and is merged into the generated output.
 *
 * Usage:
 *   export DEEPL_API_KEY=...
 *   npm run translate
 *   npm run translate -- --only=es,zh           # limit to some targets
 *   npm run translate -- --force                # ignore cache
 *   npm run translate -- --namespace=auth       # limit to one namespace
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, 'public', 'locales');
const CACHE_DIR = path.join(LOCALES_DIR, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'translations.json');

const SOURCE_LOCALE = 'en';

// DeepL language codes. Some diverge from our short codes.
const DEEPL_TARGETS: Record<string, string> = {
  es: 'ES',
  zh: 'ZH-HANS',
  hi: 'HI',
  ar: 'AR',
  fr: 'FR',
  bn: 'BN',
  pt: 'PT-BR',
  id: 'ID',
  ur: 'UR',
};

type Cache = Record<string, string>; // cacheKey → translated text
type Strings = Record<string, any>;  // nested JSON
type ContextMap = Record<string, string>; // key "namespace.key.sub" → context

function cacheKeyOf(source: string, target: string, context?: string): string {
  const h = crypto.createHash('sha1');
  h.update(source); h.update('|'); h.update(target); h.update('|'); h.update(context ?? '');
  return h.digest('hex');
}

// Read JSON, treat missing as empty.
async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(p: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function collectStrings(
  node: any,
  keyPrefix: string,
  out: Array<{ path: string; value: string }>,
): void {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    out.push({ path: keyPrefix, value: node });
    return;
  }
  if (typeof node !== 'object') return;
  for (const k of Object.keys(node)) {
    const next = keyPrefix ? `${keyPrefix}.${k}` : k;
    collectStrings(node[k], next, out);
  }
}

function setAtPath(target: any, keyPath: string, value: string): void {
  const parts = keyPath.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// XML-safe wrap/unwrap for DeepL (tag_handling=xml).
//
// Order per string:
//   1. Escape bare &, <, > → XML entities so DeepL's XML parser doesn't choke.
//   2. Wrap each {{placeholder}} inside <x id="N">...</x> with ignore_tags=x.
//   3. (after translation) Unwrap <x> tags back to their placeholder text.
//   4. Unescape entities back to &, <, >.
// ---------------------------------------------------------------------------

function escapeForXml(s: string): string {
  // Order matters: & first so later escapes don't double-encode.
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(s: string): string {
  // &amp; last to avoid double-decoding (e.g. &amp;lt; → &lt; → <).
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const PLACEHOLDER_RE = /\{\{\s*[\w.]+\s*\}\}/g;

// Ensure every { { has a matching } } — otherwise the translation will be
// mangled by DeepL's tokenizer. Returns an error message or null.
function validatePlaceholders(text: string): string | null {
  const opens = (text.match(/\{\{/g) ?? []).length;
  const closes = (text.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    return `Mismatched braces (opens=${opens}, closes=${closes})`;
  }
  return null;
}

// Wrap {{placeholders}} in DeepL-protected tags; escape bare XML specials.
function wrap(text: string): { wrapped: string; restore: (s: string) => string } {
  const tokens: string[] = [];

  // Step 1: replace placeholders with a reserved sentinel so the XML escape
  // can't touch them.
  const sentinel = (i: number) => `PH${i}`;
  const withSentinels = text.replace(PLACEHOLDER_RE, (m) => {
    tokens.push(m);
    return sentinel(tokens.length - 1);
  });

  // Step 2: XML-escape the rest of the body.
  const escaped = escapeForXml(withSentinels);

  // Step 3: swap sentinels for <x id="N">{{placeholder}}</x>.
  const wrapped = escaped.replace(/PH(\d+)/g, (_m, idStr) => {
    const i = Number(idStr);
    return `<x id="${i}">${tokens[i]}</x>`;
  });

  const restore = (s: string) => {
    const unwrapped = s.replace(
      /<x id="(\d+)">[\s\S]*?<\/x>/g,
      (_m, id) => tokens[Number(id)] ?? '',
    );
    return unescapeXml(unwrapped);
  };

  return { wrapped, restore };
}

type DeepLResponse = { translations: Array<{ text: string }> };

// Tracks any strings that couldn't be translated so the user can fix them.
export type Skipped = {
  namespace: string;
  key: string;
  source: string;
  reason: string;
};
const skippedGlobal: Skipped[] = [];

async function postDeepL(
  apiKey: string,
  texts: string[],
  targetLangDeepL: string,
  contextLine?: string,
): Promise<string[]> {
  const endpoint = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const params = new URLSearchParams();
  for (const t of texts) params.append('text', t);
  params.set('source_lang', 'EN');
  params.set('target_lang', targetLangDeepL);
  params.set('tag_handling', 'xml');
  params.set('ignore_tags', 'x');
  if (contextLine) params.set('context', contextLine);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`DeepL ${res.status}: ${errText.slice(0, 300)}`);
  }
  const payload = (await res.json()) as DeepLResponse;
  return payload.translations.map((t) => t.text);
}

// Translate a chunk. If DeepL rejects the whole batch with a 4xx, isolate
// the bad texts one by one, skip them, return translations for the rest.
// Each entry in `labels` is { ns, key } matching the position in `texts`.
async function translateBatch(
  apiKey: string,
  texts: string[],
  labels: Array<{ ns: string; key: string; source: string }>,
  targetLangDeepL: string,
  contextLine?: string,
): Promise<Array<string | null>> {
  try {
    const out = await postDeepL(apiKey, texts, targetLangDeepL, contextLine);
    return out;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (!msg.startsWith('DeepL 4')) throw e; // transient / non-4xx — bubble

    console.warn(`  ! batch of ${texts.length} rejected by DeepL (${targetLangDeepL}) — isolating…`);

    const results: Array<string | null> = new Array(texts.length).fill(null);

    // Try each text on its own; record skipped ones in the global log.
    for (let i = 0; i < texts.length; i += 1) {
      try {
        const [single] = await postDeepL(apiKey, [texts[i]], targetLangDeepL, contextLine);
        results[i] = single;
      } catch (singleErr: any) {
        const reason = String(singleErr?.message ?? singleErr).slice(0, 200);
        skippedGlobal.push({
          namespace: labels[i].ns,
          key: labels[i].key,
          source: labels[i].source,
          reason,
        });
        console.warn(`    · skip ${labels[i].ns}.${labels[i].key}: ${reason}`);
        results[i] = null;
      }
    }
    return results;
  }
}

function parseArgs(): {
  onlyLocales: string[] | null;
  namespace: string | null;
  force: boolean;
} {
  const argv = process.argv.slice(2);
  let onlyLocales: string[] | null = null;
  let namespace: string | null = null;
  let force = false;
  for (const a of argv) {
    if (a.startsWith('--only=')) onlyLocales = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--namespace=')) namespace = a.slice(12);
    else if (a === '--force') force = true;
  }
  return { onlyLocales, namespace, force };
}

async function main() {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    console.error('DEEPL_API_KEY is not set. Get a key from deepl.com/pro-api.');
    process.exit(2);
  }

  const { onlyLocales, namespace, force } = parseArgs();
  const targets = Object.keys(DEEPL_TARGETS).filter((l) => !onlyLocales || onlyLocales.includes(l));
  if (targets.length === 0) {
    console.error('No target locales match.');
    process.exit(2);
  }

  const sourceDir = path.join(LOCALES_DIR, SOURCE_LOCALE);
  const contexts = await readJson<ContextMap>(path.join(sourceDir, '_contexts.json'), {});
  const namespaceFiles = (await fs.readdir(sourceDir))
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .filter((f) => !namespace || f === `${namespace}.json`);

  if (namespaceFiles.length === 0) {
    console.error('No namespace JSON files in', sourceDir);
    process.exit(2);
  }

  const cache: Cache = force ? {} : await readJson<Cache>(CACHE_FILE, {});
  let apiCalls = 0;
  let strings = 0;

  for (const file of namespaceFiles) {
    const ns = file.replace(/\.json$/, '');
    const sourceJson = await readJson<Strings>(path.join(sourceDir, file), {});
    const collected: Array<{ path: string; value: string }> = [];
    collectStrings(sourceJson, '', collected);

    for (const targetLocale of targets) {
      const deepLTarget = DEEPL_TARGETS[targetLocale];
      const outPath = path.join(LOCALES_DIR, targetLocale, file);
      const overridePath = path.join(LOCALES_DIR, targetLocale, `_overrides.json`);
      const overrides = await readJson<Strings>(overridePath, {});
      const out: Strings = {};

      // Batch strings that need translating — cache hits go straight through.
      const toTranslate: Array<{
        path: string;
        source: string;
        wrapped: string;
        restore: (s: string) => string;
        context?: string;
      }> = [];
      for (const { path: keyPath, value } of collected) {
        const fullKey = `${ns}.${keyPath}`;
        const overrideVal = readAtPath(overrides, keyPath);
        if (typeof overrideVal === 'string') {
          setAtPath(out, keyPath, overrideVal);
          continue;
        }
        // Validate placeholders — a broken {{var}} would mangle translation.
        const validationErr = validatePlaceholders(value);
        if (validationErr) {
          skippedGlobal.push({ namespace: ns, key: keyPath, source: value, reason: validationErr });
          console.warn(`  · skip ${ns}.${keyPath}: ${validationErr}`);
          continue;
        }
        const context = contexts[fullKey];
        const ck = cacheKeyOf(value, deepLTarget, context);
        if (cache[ck]) {
          setAtPath(out, keyPath, cache[ck]);
          continue;
        }
        const { wrapped, restore } = wrap(value);
        toTranslate.push({ path: keyPath, source: value, wrapped, restore, context });
      }

      // DeepL allows up to 50 texts per request. Chunk.
      for (let i = 0; i < toTranslate.length; i += 50) {
        const chunk = toTranslate.slice(i, i + 50);
        const ctx = chunk.find((x) => x.context)?.context;
        const labels = chunk.map((x) => ({ ns, key: x.path, source: x.source }));
        const translated = await translateBatch(
          apiKey,
          chunk.map((x) => x.wrapped),
          labels,
          deepLTarget,
          ctx,
        );
        apiCalls += 1;
        for (let j = 0; j < chunk.length; j += 1) {
          const entry = chunk[j];
          const raw = translated[j];
          if (raw == null) {
            // Per-string skip — leave unset in `out`; English fallback at load time.
            continue;
          }
          const final = entry.restore(raw);
          setAtPath(out, entry.path, final);
          const fullKey = `${ns}.${entry.path}`;
          const context = contexts[fullKey];
          cache[cacheKeyOf(entry.source, deepLTarget, context)] = final;
        }
      }

      strings += collected.length;
      await writeJson(outPath, out);
      console.log(`  → ${targetLocale}/${file}  (${collected.length} strings, ${toTranslate.length} via API)`);
    }
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await writeJson(CACHE_FILE, cache);

  console.log(`\nDone. ${strings} strings × ${targets.length} locales. ${apiCalls} DeepL API calls.`);

  if (skippedGlobal.length > 0) {
    console.log(`\n${skippedGlobal.length} skipped string${skippedGlobal.length === 1 ? '' : 's'}:`);
    for (const s of skippedGlobal) {
      console.log(`  · ${s.namespace}.${s.key}  source=${JSON.stringify(s.source)}  reason=${s.reason}`);
    }
    console.log('\nFix the source strings above and re-run. Skipped keys will fall back to English at runtime.');
  }
}

function readAtPath(obj: any, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let cursor: any = obj;
  for (const p of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[p];
  }
  return cursor;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
