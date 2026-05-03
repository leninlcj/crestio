// Shared utilities for CSV bulk import (students + households).
// Used both client-side (column auto-mapping, phone validation) and
// server-side (commit handlers, template generation). Stays free of
// React / Next imports so it can run in either context.

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Header normalisation + fuzzy mapping
// ---------------------------------------------------------------------------

// Strip BOM, collapse whitespace, lowercase, drop punctuation. The same
// function is used on file headers and on the synonyms below — that way we
// can compare them with a single equality check.
export function normaliseHeader(raw: string): string {
  return (raw ?? '')
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Field key -> set of normalised header strings the user might have.
// Listed in priority order: an exact match wins; if multiple synonyms could
// match a header, the field that lists it earliest wins.
type SynonymMap<K extends string> = Record<K, readonly string[]>;

export type StudentField =
  | 'name'
  | 'household_name'
  | 'subjects'
  | 'year_level'
  | 'pay_rate_dollars'
  | 'notes';

export const STUDENT_SYNONYMS: SynonymMap<StudentField> = {
  name: [
    'name', 'student name', 'student', 'full name', 'student full name',
    'child name', 'child', 'pupil', 'pupil name',
  ],
  household_name: [
    'household', 'household name', 'family', 'family name',
    'guardian household', 'household label',
  ],
  subjects: [
    'subjects', 'subject', 'topics', 'topic', 'subject area', 'subject areas',
  ],
  year_level: [
    'year', 'year level', 'grade', 'grade level', 'year grade', 'level',
    'school year', 'class', 'form',
  ],
  pay_rate_dollars: [
    'pay rate', 'pay rate dollars', 'rate', 'hourly rate', 'price', 'fee',
    'fee per hour', 'rate per hour', 'cost', 'dollars per hour',
  ],
  notes: [
    'notes', 'note', 'comment', 'comments', 'description', 'remarks',
  ],
};

export type HouseholdField =
  | 'household_name'
  | 'parent_name'
  | 'parent_email'
  | 'parent_phone'
  | 'billing_address'
  | 'preferred_currency';

export const HOUSEHOLD_SYNONYMS: SynonymMap<HouseholdField> = {
  household_name: [
    'household', 'household name', 'family', 'family name', 'household label',
  ],
  parent_name: [
    'parent name', 'parent', 'guardian name', 'guardian',
    'contact name', 'primary contact', 'name', 'full name',
  ],
  parent_email: [
    'parent email', 'email', 'e mail', 'email address', 'contact email',
    'guardian email', 'billing email',
  ],
  parent_phone: [
    'parent phone', 'phone', 'mobile', 'cell', 'cellphone', 'tel',
    'telephone', 'contact', 'contact number', 'guardian phone',
  ],
  billing_address: [
    'address', 'billing address', 'home address', 'street address',
    'mailing address', 'postal address',
  ],
  preferred_currency: [
    'currency', 'preferred currency', 'pay currency', 'billing currency',
  ],
};

// Field-keyed anti-match rules: certain field keys must NEVER bind to headers
// that look like a different concept. Without this, "parent name" would
// substring-match the "name" synonym for student.name and quietly overwrite
// the student name from a parent column. Add new rules here as needed.
const ANTI_MATCH: Record<string, (headerNorm: string) => boolean> = {
  // Student name field must not absorb any column that's clearly about a
  // parent/guardian (e.g. "parent name", "parent_name", "parent contact name",
  // "parents", "guardian"). normaliseHeader has already collapsed
  // underscores/dashes/dots into spaces, so the check is on word boundaries.
  name: (h) => /(^|\s)(parent|parents|guardian|guardians)(\s|$)/.test(h),
};

// Score a header against a synonym set. Lower is better; -1 = no match.
function matchScore(
  headerNorm: string,
  synonyms: readonly string[],
  fieldKey?: string,
): number {
  if (fieldKey && ANTI_MATCH[fieldKey]?.(headerNorm)) return -1;
  for (let i = 0; i < synonyms.length; i++) {
    if (synonyms[i] === headerNorm) return i;
  }
  for (let i = 0; i < synonyms.length; i++) {
    if (headerNorm.includes(synonyms[i]) || synonyms[i].includes(headerNorm)) {
      return 100 + i;
    }
  }
  return -1;
}

// Pick the best field key for a given raw CSV header. Returns null when no
// synonym matches — caller marks the column as "skip".
export function autoMapHeader<K extends string>(
  rawHeader: string,
  synonyms: SynonymMap<K>,
): K | null {
  const norm = normaliseHeader(rawHeader);
  if (!norm) return null;
  let bestKey: K | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  (Object.keys(synonyms) as K[]).forEach((k) => {
    const score = matchScore(norm, synonyms[k], k as string);
    if (score >= 0 && score < bestScore) {
      bestScore = score;
      bestKey = k;
    }
  });
  return bestKey;
}

// Map all headers at once, but make sure each field key is only assigned to
// the single best matching column. Without this, two columns called e.g.
// "name" and "student name" would both map to `name`, silently overwriting
// each other on import.
export function autoMapHeaders<K extends string>(
  headers: readonly string[],
  synonyms: SynonymMap<K>,
): Record<number, K | null> {
  const candidates: Array<{ idx: number; key: K; score: number }> = [];
  headers.forEach((h, idx) => {
    const norm = normaliseHeader(h);
    if (!norm) return;
    (Object.keys(synonyms) as K[]).forEach((k) => {
      const score = matchScore(norm, synonyms[k], k as string);
      if (score >= 0) candidates.push({ idx, key: k, score });
    });
  });
  candidates.sort((a, b) => a.score - b.score);

  const result: Record<number, K | null> = {};
  headers.forEach((_, idx) => { result[idx] = null; });
  const usedKeys = new Set<K>();
  for (const c of candidates) {
    if (result[c.idx] !== null) continue;
    if (usedKeys.has(c.key)) continue;
    result[c.idx] = c.key;
    usedKeys.add(c.key);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

// Best-effort phone normalisation. Defaults the country to whatever the org
// hints at; falls back to scanning likely English-speaking regions when no
// hint is available, since real spreadsheets rarely include country codes.
const PHONE_FALLBACK_COUNTRIES: readonly CountryCode[] = ['US', 'GB', 'AU', 'CA', 'NZ', 'IE'];

export function normalisePhone(raw: string, defaultCountry?: CountryCode): PhoneResult {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const tryCountries: CountryCode[] = [];
  if (defaultCountry) tryCountries.push(defaultCountry);
  for (const c of PHONE_FALLBACK_COUNTRIES) {
    if (!tryCountries.includes(c)) tryCountries.push(c);
  }

  // First try without a country (works for E.164 with leading +).
  const noCountry = parsePhoneNumberFromString(trimmed);
  if (noCountry?.isValid()) return { ok: true, e164: noCountry.number };

  // Two-pass strategy. Strict first: a country only "wins" if the parsed
  // number's country matches the country we passed in. This is what fixes
  // UK national format like "07700 900123" — a naive first-valid loop will
  // often happily parse it as a US number (libphonenumber strips the leading
  // 0 and gets 10 digits starting with 770, a valid Atlanta area code), so
  // 'US' would short-circuit the loop before 'GB' ever gets a try. By
  // requiring parsed.country === c, only GB can claim this number, and the
  // loop continues until a country actually owns the format.
  for (const c of tryCountries) {
    const parsed = parsePhoneNumberFromString(trimmed, c);
    if (parsed?.isValid() && parsed.country === c) {
      return { ok: true, e164: parsed.number };
    }
  }
  // Loose fallback: if no country claims it as their own, accept any country
  // that says it's valid — better than rejecting a number the user can read
  // and dial in their head.
  for (const c of tryCountries) {
    const parsed = parsePhoneNumberFromString(trimmed, c);
    if (parsed?.isValid()) {
      return { ok: true, e164: parsed.number };
    }
  }
  return { ok: false, reason: `Could not parse phone "${trimmed}".` };
}

// ---------------------------------------------------------------------------
// Subjects parsing
// ---------------------------------------------------------------------------

// Free-text subject string -> deduped, trimmed array. Accepts comma, slash,
// pipe, semicolon, and the word "and" as separators — typical of how tutors
// write subject lists in spreadsheets ("Maths, Physics", "Maths/Physics",
// "Maths and Physics").
export function parseSubjects(raw: string): string[] {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s*(?:[,;/|]|\band\b|&)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV escaping (used for templates + error reports)
// ---------------------------------------------------------------------------

export function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvEscape).join(',');
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function stripBOM(s: string): string {
  return s.replace(/^﻿/, '');
}
