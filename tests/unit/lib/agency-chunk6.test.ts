import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGENCY, BEST_TIMES, CORE_SUBJECTS, IB_SUBJECTS, RATE_CARD, REQUEST_SUBJECTS, SUBJECTS, TUTOR_PAY_BANDS,
  bestTimeLabel, rateBand, subjectsForYearLevel,
} from '../../../lib/agency';
import { validateEnquiry } from '../../../lib/agencyForms';
import { ENQUIRY_COPY_ES, CALL_COPY_EN, CALL_COPY_ES } from '../../../lib/enquiryCopy';
import { CLASS_RULES, GROUP_CLASSES, classByKey, classTermPrice, classWeeklyPrice, formatDollars } from '../../../lib/classes';
import { buildCallbackMissedEmail, buildEnquiryAlertEmail, buildEnquiryReceivedEmail } from '../../../lib/emails/agency';
import { ntfyEndpoint, pushOwner } from '../../../lib/notify';

const ROOT = path.resolve(__dirname, '../../..');
const NO_EM_DASH = (s: string) => expect(s).not.toContain('—');

describe('subject tiers', () => {
  it('every subject has a rate band, a tier and at least one year level', () => {
    for (const s of SUBJECTS) {
      expect(RATE_CARD.some((b) => b.key === s.rateBand), s.key).toBe(true);
      expect(['core', 'request', 'ib']).toContain(s.tier);
      expect(s.yearLevels.length).toBeGreaterThan(0);
    }
    expect(CORE_SUBJECTS.length + REQUEST_SUBJECTS.length + IB_SUBJECTS.length).toBe(SUBJECTS.length);
  });

  it('maths and sciences are core; IB sits in the Extension 2 band; English and humanities are by request', () => {
    expect(CORE_SUBJECTS.map((s) => s.group).every((g) => g === 'maths' || g === 'science')).toBe(true);
    for (const s of IB_SUBJECTS) expect(s.rateBand).toBe('ext2');
    expect(REQUEST_SUBJECTS.map((s) => s.key)).toEqual(expect.arrayContaining(['english_advanced', 'economics', 'legal_studies']));
  });

  it('filters subjects by year level the way the forms need', () => {
    const y8 = subjectsForYearLevel('Year 8').map((s) => s.key);
    expect(y8).toEqual(['maths_7_10', 'science_7_10']);
    const y11 = subjectsForYearLevel('Year 11').map((s) => s.key);
    expect(y11).toContain('chemistry');
    expect(y11).not.toContain('maths_ext2');
    expect(y11).toContain('ib_maths_aa');
    expect(subjectsForYearLevel('Year 12').map((s) => s.key)).toContain('maths_ext2');
    expect(subjectsForYearLevel('University').length).toBe(SUBJECTS.length);
  });

  it('the Spanish copy names every subject', () => {
    for (const s of SUBJECTS) expect(ENQUIRY_COPY_ES.subjects.labels[s.key], s.key).toBeTruthy();
  });
});

describe('prices and pay after the 6 September repricing', () => {
  it('online is 75 / 85 / 95 and in-home is unchanged', () => {
    expect(rateBand('years_7_10').online).toBe(75);
    expect(rateBand('hsc').online).toBe(85);
    expect(rateBand('ext2').online).toBe(95);
    expect(rateBand('years_7_10').inHome).toBe(95);
    expect(rateBand('hsc').inHome).toBe(110);
    expect(rateBand('ext2').inHome).toBe(125);
  });

  it('Crestio keeps between 40% and 50% of every lesson after the tutor fee', () => {
    for (const [key, pay] of Object.entries(TUTOR_PAY_BANDS)) {
      const band = rateBand(key as 'years_7_10' | 'hsc' | 'ext2');
      for (const mode of ['online', 'inHome'] as const) {
        const price = band[mode]!;
        const share = (price - pay[mode]) / price;
        expect(share, `${key} ${mode}`).toBeGreaterThanOrEqual(0.4);
        expect(share, `${key} ${mode}`).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

describe('call requests: validation', () => {
  const base = { preferred_contact: 'call', parent_name: 'Priya Nair', phone: '0400 000 000', year_level: 'Year 11', best_time: 'evening' };

  it('needs a name, a phone and a year; nothing else', () => {
    const v = validateEnquiry(base);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.preferred_contact).toBe('call');
      expect(v.value.email).toBeNull();
      expect(v.value.subjects).toEqual([]);
      expect(v.value.best_time).toBe('evening');
      expect(v.value.mode).toBe('either');
    }
  });

  it('refuses a call request without a number, and a bad optional email', () => {
    const noPhone = validateEnquiry({ ...base, phone: '' });
    expect(noPhone.ok).toBe(false);
    if (!noPhone.ok) expect(noPhone.errors.phone).toBeTruthy();
    const badEmail = validateEnquiry({ ...base, email: 'not-an-email' });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.errors.email).toBeTruthy();
  });

  it('accepts a class key it knows and drops one it does not', () => {
    const good = validateEnquiry({ ...base, class_key: 'y12_physics' });
    expect(good.ok && good.value.class_key).toBe('y12_physics');
    const bad = validateEnquiry({ ...base, class_key: 'y13_alchemy' });
    expect(bad.ok && bad.value.class_key).toBeNull();
  });

  it('the long form still needs an email and a subject', () => {
    const v = validateEnquiry({ parent_name: 'Sam Lee', phone: '0400 000 000', year_level: 'Year 8', mode: 'online' });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.email).toBeTruthy();
      expect(v.errors.subjects).toBeTruthy();
    }
    const ok = validateEnquiry({ parent_name: 'Sam Lee', email: 'sam@example.com', year_level: 'Year 8', subjects: ['maths_7_10', 'science_7_10'], mode: 'online' });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.preferred_contact).toBe('email');
      expect(ok.value.best_time).toBeNull();
    }
  });

  it('best-time keys all have labels in both languages', () => {
    for (const b of BEST_TIMES) {
      expect(bestTimeLabel(b.key)).toBe(b.label);
      expect(CALL_COPY_EN.bestTimes[b.key]).toBeTruthy();
      expect(CALL_COPY_ES.bestTimes[b.key]).toBeTruthy();
    }
    expect(bestTimeLabel(null)).toBeNull();
  });
});

describe('call requests: emails and push', () => {
  const args = {
    parentName: 'Priya Nair', email: null, phone: '0400 000 000', studentFirstName: 'Amy', yearLevel: 'Year 11', subjects: [] as string[],
    mode: 'either', suburb: null, need: null, message: null, enquiryId: 'e1', preferredContact: 'call' as const, bestTime: 'evening', className: null,
  };

  it('the owner alert leads with the number and the promise', () => {
    const b = buildEnquiryAlertEmail(args);
    expect(b.subject.startsWith('CALL 0400 000 000: Priya Nair')).toBe(true);
    expect(b.text).toContain('Best time: Evening, 5 pm to 8 pm');
    expect(b.text).toContain('To be discussed on the call');
    expect(/^[\x00-\x7F]*$/.test(b.text)).toBe(true);
    NO_EM_DASH(b.html);
  });

  it('the family confirmation restates the promise and the number', () => {
    const b = buildEnquiryReceivedEmail({ ...args, email: 'priya@example.com' });
    expect(b.subject).toBe('Thanks Priya, Lenin will call you shortly');
    expect(b.text).toContain(AGENCY.callBack.promise);
    expect(b.text).toContain('We will call 0400 000 000');
    expect(/^[\x00-\x7F]*$/.test(b.text)).toBe(true);
  });

  it('a class registration names the class in both emails', () => {
    const b = buildEnquiryAlertEmail({ ...args, className: 'Year 12 Physics' });
    expect(b.subject).toContain('Year 12 Physics');
    expect(b.text).toContain('Class: Year 12 Physics');
  });

  it('the missed-call note promises another attempt within a business day, in both languages', () => {
    const en = buildCallbackMissedEmail({ parentName: 'Priya Nair', phone: '0400 000 000', attempts: 1 });
    expect(en.subject).toBe('We tried to call you, Priya');
    expect(en.text).toContain('within one business day');
    expect(/^[\x00-\x7F]*$/.test(en.text)).toBe(true);
    const es = buildCallbackMissedEmail({ parentName: 'Priya Nair', phone: null, attempts: 2, lang: 'es' });
    expect(es.subject).toBe('Intentamos llamarte, Priya');
    expect(es.html).toContain('día hábil');
    NO_EM_DASH(en.html);
    NO_EM_DASH(es.html);
  });

  it('push is a no-op without NTFY_TOPIC and posts ASCII headers with it', async () => {
    const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
    expect(ntfyEndpoint(env({}))).toBeNull();
    expect(ntfyEndpoint(env({ NTFY_TOPIC: 'short' }))).toBeNull();
    expect(ntfyEndpoint(env({ NTFY_TOPIC: 'crestio-abc123' }))).toBe('https://ntfy.sh/crestio-abc123');
    const off = await pushOwner({ title: 'x', message: 'y' });
    expect(off).toEqual({ sent: false, reason: 'not_configured' });

    process.env.NTFY_TOPIC = 'crestio-test-topic';
    try {
      const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Title).toBe('Call Priya Nair 0400 000 000 - Year 11');
        expect(headers.Priority).toBe('4');
        expect(headers.Click).toBe('https://crestio.ai/app/leads?enquiry=e1');
        expect(init?.body).toBe('Year 11 · Physics');
        return new Response('ok', { status: 200 });
      });
      const r = await pushOwner({ title: 'Call Priya Nair 0400 000 000 · Year 11', message: 'Year 11 · Physics', click: 'https://crestio.ai/app/leads?enquiry=e1', priority: 4 }, fetchMock as unknown as typeof fetch);
      expect(r).toEqual({ sent: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://ntfy.sh/crestio-test-topic');
    } finally {
      delete process.env.NTFY_TOPIC;
    }
  });
});

describe('group classes', () => {
  it('prices add up: $45 an hour, two hours, ten weeks is $900', () => {
    const c = classByKey('y12_maths_advanced')!;
    expect(classWeeklyPrice(c)).toBe(90);
    expect(classTermPrice(c)).toBe(900);
    const y10 = classByKey('y10_maths')!;
    expect(classWeeklyPrice(y10)).toBe(60);
    expect(classTermPrice(y10)).toBe(600);
    const intensive = classByKey('jan_physics_intensive')!;
    expect(classTermPrice(intensive)).toBe(270);
    expect(formatDollars(902.5)).toBe('$902.50');
    expect(formatDollars(900)).toBe('$900');
  });

  it('every class is under the one-to-one HSC price per hour and within the size rules', () => {
    for (const c of GROUP_CLASSES) {
      expect(c.pricePerHour).toBeLessThan(rateBand('hsc').online!);
      expect(c.blurb.length).toBeGreaterThan(20);
      NO_EM_DASH(c.blurb + c.when + c.title);
    }
    expect(CLASS_RULES.minStudents).toBeLessThan(CLASS_RULES.maxStudents);
    expect(classByKey('nope')).toBeUndefined();
  });
});

describe('the site says what the config says', () => {
  it('the call-back promise and the request-a-call route appear where families look', () => {
    for (const f of ['components/agency/blocks.tsx', 'components/marketing/MarketingNav.tsx', 'pages/request-a-call.tsx', 'pages/classes.tsx', 'pages/how-it-works.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).toMatch(/request-a-call|callBack|Request a call/);
    }
    const cta = fs.readFileSync(path.join(ROOT, 'components/agency/AgencyPage.tsx'), 'utf8');
    expect(cta).toContain('href="/request-a-call"');
    expect(cta).not.toContain('Book a free consultation');
  });

  it('nothing public still promises a consultation booking or a maths-and-physics-only agency', () => {
    const files = ['pages/index.tsx', 'pages/pricing.tsx', 'pages/contact.tsx', 'components/marketing/MarketingFooter.tsx', 'pages/tutoring/[suburb].tsx'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).not.toContain('Book a free consultation');
    }
    const about = fs.readFileSync(path.join(ROOT, 'pages/about.tsx'), 'utf8');
    expect(about).not.toContain('Ace Tutors');
  });
});
