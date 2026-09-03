import { describe, expect, it } from 'vitest';
import { isLateCancellation, LATE_CANCEL_HOURS } from '../../../lib/lateCancellation';
import { validateIncident } from '../../../lib/incidentForms';
import { effectivePlanTier, AGENCY_MAX_TUTORS } from '../../../lib/agencyPlan';
import { agencyInvoiceNote } from '../../../lib/agency';
import { TUTOR_AGREEMENT, CODE_OF_CONDUCT, CHILD_SAFE_POLICY, TUTOR_AGREEMENT_VERSION } from '../../../lib/agencyLegal';

describe('late cancellation rule', () => {
  const now = new Date('2026-10-01T06:00:00Z');
  it('is late when a family cancels inside the notice window', () => {
    const start = new Date(now.getTime() + (LATE_CANCEL_HOURS - 1) * 3_600_000).toISOString();
    expect(isLateCancellation(start, 'family', now)).toBe(true);
  });
  it('is not late outside the window', () => {
    const start = new Date(now.getTime() + (LATE_CANCEL_HOURS + 1) * 3_600_000).toISOString();
    expect(isLateCancellation(start, 'family', now)).toBe(false);
  });
  it('never charges tutor or agency cancellations', () => {
    const start = new Date(now.getTime() + 3_600_000).toISOString();
    expect(isLateCancellation(start, 'tutor', now)).toBe(false);
    expect(isLateCancellation(start, 'agency', now)).toBe(false);
  });
  it('treats a session already in the past as late (no-show style)', () => {
    const start = new Date(now.getTime() - 3_600_000).toISOString();
    expect(isLateCancellation(start, 'family', now)).toBe(true);
  });
});

describe('incident report validation', () => {
  it('accepts a full report', () => {
    const r = validateIncident({ reporter_name: 'Priya', reporter_email: 'p@example.com', reporter_role: 'parent', category: 'conduct', description: 'The tutor arrived 40 minutes late twice.', occurred_at: '2026-10-01', who: 'Sam' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.category).toBe('conduct');
    expect(r.value.occurred_at).toContain('2026-10-01');
  });
  it('rejects a thin report and the honeypot', () => {
    expect(validateIncident({ reporter_name: 'A', reporter_email: 'x', description: 'short' }).ok).toBe(false);
    expect(validateIncident({ website: 'spam' }).ok).toBe(false);
  });
});

describe('agency plan bypass', () => {
  it('gives the agency org the top tier regardless of plan', () => {
    expect(effectivePlanTier('solo', true)).toBe('growth');
    expect(effectivePlanTier(null, true)).toBe('growth');
    expect(effectivePlanTier('solo', false)).toBe('solo');
    expect(AGENCY_MAX_TUTORS).toBeGreaterThan(15);
  });
});

describe('legal documents', () => {
  it('carry a version and the agency model wording', () => {
    expect(TUTOR_AGREEMENT.version).toBe(TUTOR_AGREEMENT_VERSION);
    const text = JSON.stringify(TUTOR_AGREEMENT);
    expect(text).toMatch(/agent/i);
    expect(text).toMatch(/not an employee|not a contract of employment/i);
    expect(text).toMatch(/Working With Children Check/);
    expect(JSON.stringify(CODE_OF_CONDUCT)).toMatch(/132 111/);
    expect(JSON.stringify(CHILD_SAFE_POLICY)).toMatch(/Child Safe Standards/);
  });
  it('invoice note names the tutor when known', () => {
    expect(agencyInvoiceNote('Sam Lee')).toContain('Sam Lee');
    expect(agencyInvoiceNote(null)).toContain('your Crestio tutor');
  });
});
