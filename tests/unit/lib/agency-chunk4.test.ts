import { describe, it, expect } from 'vitest';
import { sourceFromLanding, rememberSource, currentSource, SOURCE_STORAGE_KEY } from '../../../lib/attribution';
import { PROGRAMS, programByKey, programPrice } from '../../../lib/programs';
import { TUTOR_HANDBOOK } from '../../../lib/tutorHandbook';
import { TUTOR_AGREEMENT } from '../../../lib/agencyLegal';
import { RATE_CARD, TUTOR_PAY_BANDS, AGENCY } from '../../../lib/agency';
import { isPublicPath } from '../../../pages/_app';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, dump: () => Object.fromEntries(m) };
}
function win(search: string, referrer = '') {
  return { location: { search } as Location, document: { referrer } as Document };
}

describe('enquiry attribution', () => {
  it('reads UTM tags into source/medium/campaign', () => {
    expect(sourceFromLanding('?utm_source=google&utm_medium=cpc&utm_campaign=HSC-Maths', '')).toBe('google/cpc/hsc-maths');
    expect(sourceFromLanding('?utm_source=facebook', '')).toBe('facebook');
  });

  it('recognises an ad click without UTM tags, and simple src tags', () => {
    expect(sourceFromLanding('?gclid=abc123', '')).toBe('google/cpc');
    expect(sourceFromLanding('?src=poster-hurstville', '')).toBe('poster-hurstville');
    expect(sourceFromLanding('?ref=pc-newsletter', '')).toBe('pc-newsletter');
  });

  it('records an outside referrer but not the site itself', () => {
    expect(sourceFromLanding('', 'https://www.facebook.com/groups/123')).toBe('referrer:www.facebook.com');
    expect(sourceFromLanding('', 'https://crestio.ai/pricing')).toBeNull();
    expect(sourceFromLanding('', 'https://www.crestio.ai/')).toBeNull();
    expect(sourceFromLanding('', 'not a url')).toBeNull();
    expect(sourceFromLanding('', '')).toBeNull();
  });

  it('strips characters that do not belong in a source and caps the length', () => {
    const s = sourceFromLanding('?utm_source=<script>alert(1)</script>&utm_medium=' + 'x'.repeat(200), '');
    expect(s).not.toContain('<');
    expect(s!.length).toBeLessThanOrEqual(100);
  });

  it('remembers the first source in the tab and does not overwrite it', () => {
    const storage = fakeStorage();
    rememberSource(win('?utm_source=google&utm_medium=cpc&utm_campaign=physics', ''), storage);
    rememberSource(win('', 'https://crestio.ai/tutoring/hurstville'), storage);
    rememberSource(win('?src=flyer', ''), storage);
    expect(storage.dump()[SOURCE_STORAGE_KEY]).toBe('google/cpc/physics');
  });

  it('does not write anything for a direct visit', () => {
    const storage = fakeStorage();
    rememberSource(win('', ''), storage);
    expect(storage.dump()).toEqual({});
  });

  it('sends the remembered source, else the current page, else direct, with the Spanish prefix', () => {
    expect(currentSource(win('', ''), fakeStorage({ [SOURCE_STORAGE_KEY]: 'google/cpc/physics' }))).toBe('google/cpc/physics');
    expect(currentSource(win('?src=poster', ''), fakeStorage())).toBe('poster');
    expect(currentSource(win('', ''), fakeStorage())).toBe('direct');
    expect(currentSource(win('', ''), null, 'es')).toBe('es:direct');
    expect(currentSource(win('', ''), fakeStorage({ [SOURCE_STORAGE_KEY]: 'flyer' }), 'es')).toBe('es:flyer');
  });

  it('survives a storage that throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => rememberSource(win('?src=x', ''), broken)).not.toThrow();
    expect(currentSource(win('?src=x', ''), broken)).toBe('x');
  });
});

describe('summer programs', () => {
  it('prices every program as the rate card times the lesson count', () => {
    for (const p of PROGRAMS) {
      const band = RATE_CARD.find((b) => b.key === p.rateBand)!;
      expect(programPrice(p, 'online')).toBe(band.online! * p.lessons);
      expect(programPrice(p, 'in_home')).toBe(band.inHome! * p.lessons);
    }
    expect(programPrice(PROGRAMS[0], 'online', 'ext2')).toBe(110 * 4);
    expect(programPrice(PROGRAMS[0], 'in_home', 'university')).toBeNull();
  });

  it('has the expected keys, four lessons each, and no em dashes', () => {
    expect(programByKey('hsc-head-start')?.enquiryYear).toBe('Year 12');
    expect(programByKey('year-11-bridging')?.enquiryYear).toBe('Year 10');
    expect(programByKey('nope')).toBeUndefined();
    for (const p of PROGRAMS) {
      expect(p.plan).toHaveLength(p.lessons);
      expect(JSON.stringify(p)).not.toContain('—');
    }
  });

  it('marks the program pages as public so they skip the app providers', () => {
    expect(isPublicPath('/programs')).toBe(true);
    expect(isPublicPath('/tutors/handbook')).toBe(true);
    expect(isPublicPath('/app')).toBe(false);
  });
});

describe('tutor handbook', () => {
  it('quotes the same fees, notice period and contact as the agreement', () => {
    const text = JSON.stringify(TUTOR_HANDBOOK);
    for (const band of Object.values(TUTOR_PAY_BANDS)) {
      expect(text).toContain(`$${band.online}`);
      expect(text).toContain(`$${band.inHome}`);
    }
    expect(text).toContain(`${AGENCY.policies.cancellationHours} hours`);
    expect(text).toContain(AGENCY.email);
    expect(text).toContain('12 months');
    expect(text).toContain("14 days'");
    const agreementText = JSON.stringify(TUTOR_AGREEMENT);
    expect(agreementText).toContain('12 months');
    expect(agreementText).toContain("14 days'");
  });

  it('has ten sections, each with an id and no em dashes', () => {
    expect(TUTOR_HANDBOOK.sections).toHaveLength(10);
    for (const s of TUTOR_HANDBOOK.sections) expect(s.id).toMatch(/^[a-z-]+$/);
    expect(JSON.stringify(TUTOR_HANDBOOK)).not.toContain('—');
  });
});
