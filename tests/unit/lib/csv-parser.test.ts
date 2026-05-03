import { describe, it, expect } from 'vitest';
import {
  autoMapHeaders,
  autoMapHeader,
  normalisePhone,
  normaliseHeader,
  parseSubjects,
  STUDENT_SYNONYMS,
  HOUSEHOLD_SYNONYMS,
} from '@/lib/csvImport';

describe('normaliseHeader', () => {
  it('strips BOM, lowercases, collapses punctuation/whitespace', () => {
    expect(normaliseHeader('﻿Parent_Name')).toBe('parent name');
    // dashes are collapsed to spaces (not removed) so "E-Mail" -> "e mail"
    expect(normaliseHeader('  E-Mail Address ')).toBe('e mail address');
    expect(normaliseHeader('Pay/Rate.Per Hour')).toBe('pay rate per hour');
  });
});

describe('autoMapHeaders — anti-match for parent vs student name', () => {
  it('does NOT map a "parent_name" column to the student.name field', () => {
    // Regression for the bug where a student CSV with a "Parent Name" column
    // would silently overwrite student.name.
    const headers = ['Parent Name', 'Student Name', 'Year', 'Pay Rate'];
    const map = autoMapHeaders(headers, STUDENT_SYNONYMS);
    expect(map[0]).not.toBe('name');
    expect(map[1]).toBe('name');
  });

  it('still maps "parent name" correctly when feeding HOUSEHOLD_SYNONYMS', () => {
    const headers = ['Parent Name', 'Email', 'Phone'];
    const map = autoMapHeaders(headers, HOUSEHOLD_SYNONYMS);
    expect(map[0]).toBe('parent_name');
    expect(map[1]).toBe('parent_email');
    expect(map[2]).toBe('parent_phone');
  });

  it('"John Smith" parent column does not bind to a column called just "name" via substring match', () => {
    // The anti-match key is on the *header* shape (must look parent-y), not
    // on the *cell value*. The protective rule blocks "parent name", "parents",
    // "guardian name" etc. — never the actual person's name "John Smith".
    // But when the column header itself is parent-shaped, it must skip name.
    const map1 = autoMapHeader('parents', STUDENT_SYNONYMS);
    expect(map1).not.toBe('name');
    const map2 = autoMapHeader('guardian', STUDENT_SYNONYMS);
    expect(map2).not.toBe('name');
  });

  it('does not double-assign the same field key across two columns', () => {
    const headers = ['name', 'student name', 'pupil', 'year'];
    const map = autoMapHeaders(headers, STUDENT_SYNONYMS);
    const assignedNameCols = Object.values(map).filter((v) => v === 'name');
    expect(assignedNameCols.length).toBe(1);
  });

  it('returns null for unrecognised columns', () => {
    const headers = ['blah', 'name'];
    const map = autoMapHeaders(headers, STUDENT_SYNONYMS);
    expect(map[0]).toBeNull();
    expect(map[1]).toBe('name');
  });
});

describe('normalisePhone — UK national-format with +44 fallback', () => {
  it('parses a UK national-format mobile correctly when GB is the default country', () => {
    // 07491 123456 is a real UK mobile range (EE) that libphonenumber-js
    // recognises as a valid GB mobile.
    const result = normalisePhone('07491 123456', 'GB');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+447491123456');
  });

  it('two-pass fallback: with no country hint, a UK national-format number still resolves to +44', () => {
    // No country hint, no leading +. The first pass tries each country
    // strictly (parsed.country === c) which means US is asked first and
    // declines (07-prefixed 11-digit numbers aren't valid US numbers); the
    // loop continues until GB claims it.
    const result = normalisePhone('07491 123456');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+447491123456');
  });

  it('parses a UK number written in international form regardless of default country', () => {
    const result = normalisePhone('+44 7491 123456');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+447491123456');
  });

  it('parses an Australian mobile when AU is the default country', () => {
    const result = normalisePhone('0400 123 456', 'AU');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+61400123456');
  });

  it('returns ok:false with a useful reason for empty / unparseable input', () => {
    const empty = normalisePhone('');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('empty');

    const garbage = normalisePhone('not a phone');
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.reason).toMatch(/Could not parse/);
  });
});

describe('parseSubjects', () => {
  it('splits on commas, slashes, semicolons, "and", and ampersands; dedupes case-insensitively', () => {
    expect(parseSubjects('Maths, Physics')).toEqual(['Maths', 'Physics']);
    expect(parseSubjects('Maths/Physics/Chemistry')).toEqual(['Maths', 'Physics', 'Chemistry']);
    expect(parseSubjects('Maths and Physics')).toEqual(['Maths', 'Physics']);
    expect(parseSubjects('Maths; Maths; MATHS')).toEqual(['Maths']);
  });

  it('returns empty array for empty/whitespace input', () => {
    expect(parseSubjects('')).toEqual([]);
    expect(parseSubjects('   ')).toEqual([]);
  });
});
