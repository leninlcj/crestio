import { describe, expect, it } from 'vitest';
import { hourlyRateCents, rateBandForYearLevel, RATE_CARD, SUBJECTS, subjectLabels, FAQS, TUTOR_PAY_BANDS } from '../../../lib/agency';

describe('rate card', () => {
  it('maps every subject to an existing band', () => {
    for (const s of SUBJECTS) expect(RATE_CARD.some((b) => b.key === s.rateBand)).toBe(true);
  });
  it('prices HSC physics and Extension 2 as expected', () => {
    expect(hourlyRateCents('physics', 'online')).toBe(8500);
    expect(hourlyRateCents('physics', 'in_home')).toBe(11000);
    expect(hourlyRateCents('maths_ext2', 'in_home')).toBe(12500);
    expect(hourlyRateCents('maths_7_10', 'online')).toBe(7500);
    expect(hourlyRateCents('ib_physics', 'in_home')).toBe(12500);
    expect(hourlyRateCents('chemistry', 'online')).toBe(8500);
  });
  it('in-home is always dearer than online where offered', () => {
    for (const b of RATE_CARD) if (b.inHome != null && b.online != null) expect(b.inHome).toBeGreaterThan(b.online);
  });
  it('maps year levels to bands', () => {
    expect(rateBandForYearLevel('Year 8')).toBe('years_7_10');
    expect(rateBandForYearLevel('Year 12')).toBe('hsc');
    expect(rateBandForYearLevel('University')).toBe('university');
    expect(rateBandForYearLevel('Other')).toBeNull();
  });
  it('tutor pay stays below the parent rate in every band', () => {
    for (const [key, pay] of Object.entries(TUTOR_PAY_BANDS)) {
      const band = RATE_CARD.find((b) => b.key === key)!;
      expect(pay.online).toBeLessThan(band.online!);
      expect(pay.inHome).toBeLessThan(band.inHome!);
    }
  });
  it('labels unknown subject keys verbatim', () => {
    expect(subjectLabels(['physics', 'unknown'])).toEqual(['Physics', 'unknown']);
  });
  it('has no fabricated claims in the FAQ', () => {
    for (const f of FAQS) expect(/\d+\+? (tutors|students|families)/i.test(f.a)).toBe(false);
  });
});
