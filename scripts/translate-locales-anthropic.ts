/* eslint-disable no-console */
/**
 * translate-locales-anthropic.ts
 *
 * Claude-backed retranslation of /public/locales/en/*.json into the 9 target
 * locales. Uses @anthropic-ai/sdk (already a dep) + Claude Haiku 4.5 — cheap
 * and fast for short marketing copy.
 *
 * Same input/output contract as scripts/translate-locales.ts (the DeepL
 * variant): reads /public/locales/en/*.json, writes /public/locales/<locale>/*.json,
 * preserves nested keys, only translates string values, leaves placeholders
 * ({{var}}, {x}, %s, <tags>) literal.
 *
 * Resumable: a per-(source, locale) translation cache means re-runs only call
 * the API for new or changed strings. Cache is written after each
 * (namespace, locale) pair so an interrupted run doesn't lose everything.
 *
 * Manual overrides: /public/locales/<locale>/_overrides.json takes precedence
 * (same contract as the DeepL script).
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=...    (or put it in .env.local — auto-loaded)
 *   npm run translate:anthropic
 *   npm run translate:anthropic -- --namespace=marketing
 *   npm run translate:anthropic -- --only=es,hi
 *   npm run translate:anthropic -- --force                # ignore cache
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, 'public', 'locales');
const CACHE_DIR = path.join(LOCALES_DIR, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'translations-anthropic.json');

const SOURCE_LOCALE = 'en';
// Haiku 4.5 — the dated full ID per claude-api skill model table. Cheap, fast,
// and reliable enough for the consistent short-form marketing copy in here.
const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;       // strings per API call
const MAX_TOKENS = 8192;
const MAX_RETRIES = 2;

// locale → human-readable language name passed to Claude.
const TARGETS: Record<string, string> = {
  es: 'Spanish (Spain, neutral / international)',
  zh: 'Simplified Chinese (mainland China)',
  hi: 'Hindi (India)',
  ar: 'Modern Standard Arabic',
  fr: 'French (France)',
  bn: 'Bengali (Bangladesh)',
  pt: 'Portuguese (Brazil)',
  id: 'Indonesian',
  ur: 'Urdu (Pakistan)',
};

type Cache = Record<string, string>;
type Strings = Record<string, any>;

function cacheKeyOf(source: string, locale: string): string {
  return crypto.createHash('sha1').update(source).update('|').update(locale).digest('hex');
}

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

function readAtPath(obj: any, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let cursor: any = obj;
  for (const p of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[p];
  }
  return cursor;
}

// Lightweight .env.local loader — no new dep. Existing env vars win.
async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      // Strip surrounding double or single quotes.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env.local — fine.
  }
}

function buildSystemPrompt(targetLanguage: string): string {
  return `You translate marketing copy from English to ${targetLanguage} for Crestio, a tutoring management SaaS used by solo tutors and small tutoring practices. Crestio is built solo by Lenin Joaquin, an HSC English tutor in Sydney.

Voice: clear, professional, calm — match the source register exactly. Friendly source → friendly translation. Formal source → formal translation. Direct → direct. Avoid corporate-speak that wasn't in the source.

Brand: keep "Crestio" untranslated everywhere. Keep "HSC", "GST", "AUD", "Stripe", "Anthropic", "Supabase", "Vercel", "Notion", "TeachWorks", "Wyzant", "TutorBird" as-is.

Placeholders & tags: keep these LITERAL — do NOT translate or change them, including the names inside braces:
  - Variable placeholders: {{name}}, {{count}}, {{taken}}, {{total}}, {x}, {0}, %s, %d, $1
  - HTML / Markdown: <b>, <strong>, <a>, <em>, <code>, **bold**, *italic*, [link](url)

Currency, dates, numbers: keep digits and currency symbols as-is ($24, AUD, 14-day, 7-day, 1%, 2.9% + 30¢). Do not localize the digits. You may translate the surrounding noun (e.g. "trial").

Email addresses, URLs, file paths, and code snippets stay literal.

Idioms: prefer the natural ${targetLanguage} phrasing over a word-for-word translation. Aim for what a native speaker would actually say in that register.

You will receive a JSON array of source English strings. Reply with ONLY a JSON array of the same length, in the same order, containing the translations. No commentary, no surrounding prose, no markdown code fences.`;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function translateBatch(
  client: Anthropic,
  strings: string[],
  systemPrompt: string,
): Promise<string[]> {
  const userPrompt = JSON.stringify(strings, null, 2);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const cleaned = stripCodeFences(text);
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) throw new Error(`expected array, got ${typeof parsed}`);
      if (parsed.length !== strings.length) {
        throw new Error(`expected ${strings.length} translations, got ${parsed.length}`);
      }
      if (!parsed.every((s) => typeof s === 'string')) {
        throw new Error('non-string entry in translations array');
      }
      return parsed as string[];
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw new Error(`translateBatch failed after ${MAX_RETRIES + 1} tries: ${String(lastError)}`);
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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--only=')) {
      onlyLocales = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--only') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        onlyLocales = next.split(',').map((s) => s.trim()).filter(Boolean);
        i++;
      }
    } else if (a.startsWith('--namespace=')) {
      namespace = a.slice(12);
    } else if (a === '--namespace') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        namespace = next;
        i++;
      }
    } else if (a === '--force') {
      force = true;
    }
  }
  return { onlyLocales, namespace, force };
}

async function main() {
  await loadEnvLocal();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to .env.local and re-run.');
    process.exit(2);
  }

  const { onlyLocales, namespace, force } = parseArgs();
  const targets = Object.keys(TARGETS).filter((l) => !onlyLocales || onlyLocales.includes(l));
  if (targets.length === 0) {
    console.error('No target locales match --only filter.');
    process.exit(2);
  }

  const sourceDir = path.join(LOCALES_DIR, SOURCE_LOCALE);
  const namespaceFiles = (await fs.readdir(sourceDir))
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .filter((f) => !namespace || f === `${namespace}.json`);

  if (namespaceFiles.length === 0) {
    console.error(`No matching namespace files in ${sourceDir}.`);
    process.exit(2);
  }

  const client = new Anthropic({ apiKey });
  const cache: Cache = force ? {} : await readJson<Cache>(CACHE_FILE, {});

  let totalApiCalls = 0;
  let totalStrings = 0;
  let totalCacheHits = 0;
  let totalTranslated = 0;

  console.log(`Translating ${namespaceFiles.length} namespace(s) × ${targets.length} locale(s) with ${MODEL}.`);
  if (force) console.log('--force: ignoring cache.');

  for (const file of namespaceFiles) {
    const ns = file.replace(/\.json$/, '');
    const sourceJson = await readJson<Strings>(path.join(sourceDir, file), {});
    const collected: Array<{ path: string; value: string }> = [];
    collectStrings(sourceJson, '', collected);

    for (const targetLocale of targets) {
      const targetLanguageName = TARGETS[targetLocale];
      const outPath = path.join(LOCALES_DIR, targetLocale, file);
      const overridePath = path.join(LOCALES_DIR, targetLocale, '_overrides.json');
      const overrides = await readJson<Strings>(overridePath, {});
      const out: Strings = {};

      const toTranslate: Array<{ path: string; source: string }> = [];
      let cacheHits = 0;

      for (const { path: keyPath, value } of collected) {
        // Manual override wins.
        const overrideVal = readAtPath(overrides, keyPath);
        if (typeof overrideVal === 'string') {
          setAtPath(out, keyPath, overrideVal);
          continue;
        }

        // Cache hit?
        const ck = cacheKeyOf(value, targetLocale);
        if (cache[ck]) {
          setAtPath(out, keyPath, cache[ck]);
          cacheHits++;
          continue;
        }

        toTranslate.push({ path: keyPath, source: value });
      }

      const systemPrompt = buildSystemPrompt(targetLanguageName);
      let apiCalls = 0;
      let translatedHere = 0;

      for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
        const chunk = toTranslate.slice(i, i + BATCH_SIZE);
        const sources = chunk.map((c) => c.source);
        try {
          const translations = await translateBatch(client, sources, systemPrompt);
          apiCalls++;
          for (let j = 0; j < chunk.length; j++) {
            const entry = chunk[j];
            const translation = translations[j];
            setAtPath(out, entry.path, translation);
            cache[cacheKeyOf(entry.source, targetLocale)] = translation;
            translatedHere++;
          }
        } catch (e) {
          console.warn(`  ! batch ${i}-${i + chunk.length} for ${targetLocale}/${file}: ${String(e)}`);
          // On batch failure, leave entries unset; runtime falls back to English.
        }
      }

      totalApiCalls += apiCalls;
      totalCacheHits += cacheHits;
      totalStrings += collected.length;
      totalTranslated += translatedHere;

      await writeJson(outPath, out);
      console.log(
        `  → ${targetLocale}/${file}  (${collected.length} strings, ${cacheHits} cached, ${translatedHere} translated, ${apiCalls} API call${apiCalls === 1 ? '' : 's'})`,
      );

      // Persist cache after each (namespace, locale) so an interrupted run keeps progress.
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await writeJson(CACHE_FILE, cache);
    }
  }

  console.log(
    `\nDone. ${totalStrings} strings × ${targets.length} locales (${totalCacheHits} cache hits, ${totalTranslated} freshly translated, ${totalApiCalls} Claude API calls).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
