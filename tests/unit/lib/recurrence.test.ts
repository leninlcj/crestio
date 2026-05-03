import { describe, it, expect } from 'vitest';
import {
  computeOccurrences,
  applyNotesTemplate,
  type SessionTemplate,
} from '@/lib/sessionGeneration';
import { addDaysIso } from '@/lib/timezone';

function template(overrides: Partial<SessionTemplate> = {}): SessionTemplate {
  return {
    id: 'tpl_1',
    organization_id: 'org_1',
    student_id: 'stu_1',
    tutor_user_id: 'usr_1',
    created_by_user_id: 'usr_1',
    subject: 'Maths',
    duration_minutes: 60,
    recurrence_rule: 'weekly',
    // 2026-05-04 is a Monday (UTC). Using Australia/Sydney throughout — Sydney
    // is UTC+10 in May (no DST in autumn), so the same calendar date holds.
    day_of_week: 1, // Mon
    start_time_local: '15:00',
    timezone: 'Australia/Sydney',
    effective_from: '2026-05-04',
    effective_until: null,
    cancelled_at: null,
    notes_template: null,
    generated_through_date: null,
    ...overrides,
  };
}

describe('computeOccurrences', () => {
  it('weekly: produces one occurrence per week between effective_from and toDate', () => {
    const t = template({ recurrence_rule: 'weekly' });
    const occs = computeOccurrences(t, '2026-05-04', '2026-05-25');
    // 2026-05-04, 05-11, 05-18, 05-25 — four Mondays inclusive.
    expect(occs).toEqual(['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']);
  });

  it('fortnightly: every 14 days from the seed weekday', () => {
    const t = template({ recurrence_rule: 'fortnightly' });
    const occs = computeOccurrences(t, '2026-05-04', '2026-06-15');
    // 2026-05-04, 05-18, 06-01, 06-15
    expect(occs).toEqual(['2026-05-04', '2026-05-18', '2026-06-01', '2026-06-15']);
  });

  it('monthly: 28-day step from the seed weekday (preserves day-of-week)', () => {
    const t = template({ recurrence_rule: 'monthly' });
    const occs = computeOccurrences(t, '2026-05-04', '2026-08-04');
    // 2026-05-04, 06-01, 06-29, 07-27, but stop at 08-04 inclusive.
    // Step is 28: 05-04, 06-01, 06-29, 07-27. Next is 08-24 > 08-04 stop.
    expect(occs).toEqual(['2026-05-04', '2026-06-01', '2026-06-29', '2026-07-27']);
  });

  it('respects effective_until: cuts off when template ends mid-window', () => {
    const t = template({ effective_until: '2026-05-15' });
    const occs = computeOccurrences(t, '2026-05-04', '2026-06-30');
    // Only 05-04 and 05-11 survive; 05-18 is past effective_until.
    expect(occs).toEqual(['2026-05-04', '2026-05-11']);
  });

  it('respects fromDate: skips any occurrence before the given window start', () => {
    const t = template({ effective_from: '2026-04-01' });
    const occs = computeOccurrences(t, '2026-05-15', '2026-06-15');
    // First Monday on-or-after 2026-05-15 is 2026-05-18.
    expect(occs).toEqual(['2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15']);
  });

  it('returns empty array when window is entirely before effective_from', () => {
    const t = template({ effective_from: '2026-06-01' });
    const occs = computeOccurrences(t, '2026-05-01', '2026-05-25');
    expect(occs).toEqual([]);
  });

  it('returns empty array when start > end', () => {
    const t = template();
    const occs = computeOccurrences(t, '2026-06-01', '2026-05-01');
    expect(occs).toEqual([]);
  });

  it('idempotent: re-running with the same window yields identical occurrences', () => {
    const t = template();
    const a = computeOccurrences(t, '2026-05-04', '2026-06-04');
    const b = computeOccurrences(t, '2026-05-04', '2026-06-04');
    expect(a).toEqual(b);
  });

  it('idempotent across windows: extending the window only ADDS new dates, never duplicates', () => {
    const t = template();
    const first = computeOccurrences(t, '2026-05-04', '2026-05-25');
    const extended = computeOccurrences(t, '2026-05-04', '2026-06-22');
    // The first run's occurrences are a prefix of the extended run.
    for (const o of first) expect(extended).toContain(o);
    // Second run produced strictly more occurrences.
    expect(extended.length).toBeGreaterThan(first.length);
    // No duplicates in the extended run.
    expect(new Set(extended).size).toBe(extended.length);
  });

  it('generated_through_date math: last occurrence date stays inside the window', () => {
    const t = template();
    const occs = computeOccurrences(t, '2026-05-04', '2026-05-23');
    const last = occs[occs.length - 1];
    expect(last).toBeDefined();
    expect(last <= '2026-05-23').toBe(true);
    // And one step later would be outside the window.
    expect(addDaysIso(last, 7) > '2026-05-23').toBe(true);
  });
});

describe('applyNotesTemplate', () => {
  it('substitutes student_name, date, subject placeholders', () => {
    const out = applyNotesTemplate('Notes for {student_name} on {date} ({subject})', {
      studentName: 'Sam',
      dateIso: '2026-05-04',
      subject: 'Maths',
    });
    expect(out).toBe('Notes for Sam on 2026-05-04 (Maths)');
  });

  it('substitutes empty string for missing subject', () => {
    const out = applyNotesTemplate('Hi {student_name}, {subject} session on {date}', {
      studentName: 'Sam',
      dateIso: '2026-05-04',
      subject: null,
    });
    expect(out).toBe('Hi Sam,  session on 2026-05-04');
  });

  it('leaves unknown placeholders untouched', () => {
    const out = applyNotesTemplate('{student_name} owes us {amount}', {
      studentName: 'Sam',
      dateIso: '2026-05-04',
      subject: 'Maths',
    });
    expect(out).toBe('Sam owes us {amount}');
  });
});
