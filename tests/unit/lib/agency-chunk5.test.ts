import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PREPAID_BLOCK, REFERRAL, REVIEWS, FAQS } from '../../../lib/agency';
import {
  blockFaceValueCents, blockPriceCents, lessonsCovered, describePrepaidBlock, sumLedger, CREDIT_KIND_LABEL,
} from '../../../lib/householdCredit';
import {
  REVIEW_COPY, REVIEW_TOKEN_RE, newReviewToken, validateReviewSubmission, isDueReviewRequest, isDueReviewReminder,
} from '../../../lib/reviews';
import {
  buildReviewRequestEmail, buildReviewSubmittedAlertEmail, buildPrepaidBlockEmail, buildLowCreditEmail, buildReferralCreditEmail, buildOwnerCheckinEmail,
} from '../../../lib/emails/softRun';
import { sydneyMidnightUtc, sydneyWeekBounds } from '../../../lib/ownerCheckin';
import { checkRateLimitShared } from '../../../lib/rateLimit';

const ROOT = path.resolve(__dirname, '../../..');
const NO_EM_DASH = (s: string) => expect(s).not.toContain('—');

describe('prepaid block maths', () => {
  it('face value is hours times the hourly rate; price is 5% off, rounded to cents', () => {
    expect(blockFaceValueCents(9500, 10)).toBe(95000);
    expect(blockPriceCents(95000)).toBe(90250);
    expect(blockPriceCents(95000, 0)).toBe(95000);
    expect(blockPriceCents(11000 * 10)).toBe(104500);
    // Odd cents round rather than truncate.
    expect(blockPriceCents(9999)).toBe(Math.round(9999 * 0.95));
  });

  it('refuses nonsense inputs quietly', () => {
    expect(blockFaceValueCents(0, 10)).toBe(0);
    expect(blockFaceValueCents(9500, 0)).toBe(0);
    expect(blockFaceValueCents(NaN, 10)).toBe(0);
    expect(blockPriceCents(-5)).toBe(0);
    expect(lessonsCovered(50000, null)).toBe(0);
    expect(lessonsCovered(-100, 9500)).toBe(0);
  });

  it('lessons covered floors to whole lessons at the given length', () => {
    expect(lessonsCovered(95000, 9500)).toBe(10);
    expect(lessonsCovered(94999, 9500)).toBe(9);
    expect(lessonsCovered(95000, 9500, 90)).toBe(6);
  });

  it('describes a block for the invoice line, the note and the emails', () => {
    const d = describePrepaidBlock({ hours: 10, rateCents: 9500, studentName: 'Amy Nguyen' });
    expect(d.faceValueCents).toBe(95000);
    expect(d.priceCents).toBe(90250);
    expect(d.lineItem.amount_cents).toBe(90250);
    expect(d.lineItem.qty).toBe(10);
    expect(d.lineItem.description).toContain('Amy Nguyen');
    expect(d.lineItem.description).toContain('5% off');
    expect(d.note).toContain('$950.00');
    expect(d.note).toContain('$902.50');
    expect(d.note).toContain('refundable');
    NO_EM_DASH(d.note);
    NO_EM_DASH(d.lineItem.description);
  });

  it('sums a ledger the way the balance function does', () => {
    expect(sumLedger([{ amount_cents: 95000 }, { amount_cents: -9500 }, { amount_cents: -9500 }])).toBe(76000);
    expect(sumLedger([])).toBe(0);
    for (const k of ['purchase', 'referral', 'adjustment', 'drawdown', 'reversal'] as const) expect(CREDIT_KIND_LABEL[k]).toBeTruthy();
  });

  it('the public copy states the same numbers as the config', () => {
    expect(PREPAID_BLOCK.hours).toBe(10);
    expect(PREPAID_BLOCK.discountPercent).toBe(5);
    expect(REFERRAL.creditCents).toBe(5000);
    expect(REFERRAL.afterLessons).toBe(3);
    const pay = FAQS.find((f) => f.q === 'How do I pay?')!;
    expect(pay.a).toContain(`${PREPAID_BLOCK.hours} hours`);
    expect(pay.a).toContain(`${PREPAID_BLOCK.discountPercent}% off`);
    const pricing = fs.readFileSync(path.join(ROOT, 'pages/pricing.tsx'), 'utf8');
    expect(pricing).toContain('PREPAID_BLOCK.discountPercent');
    const terms = fs.readFileSync(path.join(ROOT, 'pages/terms.tsx'), 'utf8');
    expect(terms).toContain('REFERRAL.afterLessons');
    expect(terms).toContain('Unused credit is refunded in full on request');
  });
});

describe('reviews: tokens, validation, timing', () => {
  it('tokens are long base64url strings that pass the route check', () => {
    const t = newReviewToken();
    expect(t).toMatch(REVIEW_TOKEN_RE);
    expect(t.length).toBeGreaterThanOrEqual(30);
    expect(newReviewToken()).not.toBe(t);
    expect(REVIEW_TOKEN_RE.test('short')).toBe(false);
    expect(REVIEW_TOKEN_RE.test("x'; drop table reviews; --")).toBe(false);
  });

  it('accepts a real review and normalises it', () => {
    const v = validateReviewSubmission({ rating: '5', body: '  Amy went from dreading maths to asking for extra problems.  ', reviewer_name: ' Priya ', reviewer_suburb: 'Hurstville', consent_public: 'true' }, 'en');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.rating).toBe(5);
      expect(v.value.body).toBe('Amy went from dreading maths to asking for extra problems.');
      expect(v.value.reviewer_name).toBe('Priya');
      expect(v.value.consent_public).toBe(true);
    }
  });

  it('rejects a missing rating, an empty body, and consent without a display name', () => {
    expect(validateReviewSubmission({ rating: 0, body: 'Long enough body here.' }, 'en')).toEqual({ ok: false, error: REVIEW_COPY.en.errors.rating });
    expect(validateReviewSubmission({ rating: 4, body: 'short' }, 'es')).toEqual({ ok: false, error: REVIEW_COPY.es.errors.body });
    expect(validateReviewSubmission({ rating: 4, body: 'Long enough body here.', consent_public: true, reviewer_name: '' }, 'en')).toEqual({ ok: false, error: REVIEW_COPY.en.errors.name });
    // A private review needs no name.
    expect(validateReviewSubmission({ rating: 2, body: 'Long enough body here.', consent_public: false }, 'en').ok).toBe(true);
  });

  it('asks only after enough lessons, enough time, and not twice', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const base = { household_id: 'h', completed_lessons: 4, first_lesson_at: '2026-09-01T00:00:00Z', last_lesson_at: '2026-09-28T00:00:00Z', has_open_request: false };
    expect(isDueReviewRequest(base, now)).toBe(true);
    expect(isDueReviewRequest({ ...base, completed_lessons: REVIEWS.askAfterLessons - 1 }, now)).toBe(false);
    expect(isDueReviewRequest({ ...base, first_lesson_at: '2026-09-25T00:00:00Z' }, now)).toBe(false);
    expect(isDueReviewRequest({ ...base, has_open_request: true }, now)).toBe(false);
    expect(isDueReviewRequest({ ...base, last_lesson_at: '2026-05-01T00:00:00Z' }, now)).toBe(false);
    expect(isDueReviewRequest({ ...base, first_lesson_at: null }, now)).toBe(false);
  });

  it('reminds once, a week later, and never after two months', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(isDueReviewReminder({ status: 'requested', requested_at: '2026-10-02T00:00:00Z', reminded_at: null }, now)).toBe(true);
    expect(isDueReviewReminder({ status: 'requested', requested_at: '2026-10-05T00:00:00Z', reminded_at: null }, now)).toBe(false);
    expect(isDueReviewReminder({ status: 'requested', requested_at: '2026-10-02T00:00:00Z', reminded_at: '2026-10-09T00:00:00Z' }, now)).toBe(false);
    expect(isDueReviewReminder({ status: 'submitted', requested_at: '2026-10-02T00:00:00Z', reminded_at: null }, now)).toBe(false);
    expect(isDueReviewReminder({ status: 'requested', requested_at: '2026-07-01T00:00:00Z', reminded_at: null }, now)).toBe(false);
  });

  it('both languages carry every copy key and no em dash', () => {
    const en = REVIEW_COPY.en as Record<string, unknown>;
    const es = REVIEW_COPY.es as Record<string, unknown>;
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const c of [en, es]) {
      for (const v of Object.values(c)) {
        const text = typeof v === 'function' ? (v as (a: string | null, b: string | null) => string)('Amy', 'Lenin') + (v as (a: string | null, b: string | null) => string)(null, null) : JSON.stringify(v);
        NO_EM_DASH(text);
      }
    }
    expect(REVIEW_COPY.es.intro('Amy', null)).toContain('Amy');
    expect(REVIEW_COPY.en.intro(null, 'Lenin')).toContain('with Lenin');
  });
});

describe('chunk 5 emails', () => {
  const url = 'https://crestio.ai/review/abcdefghijklmnopqrstuvwxyz012345';

  it('review request in English is ASCII plaintext with the link on its own line', () => {
    const e = buildReviewRequestEmail({ parentName: 'Priya Nguyen', studentFirstName: 'Amy', tutorFirstName: 'Lenin', reviewUrl: url, lang: 'en' });
    expect(e.subject).toBe('How is tutoring going for Amy?');
    expect(e.text).toMatch(/^Hi Priya,/);
    expect(e.text).toContain(`\n${url}`);
    expect(e.text).toContain(`${REVIEWS.askAfterLessons} lessons with Lenin`);
    expect(e.html).toContain('Write the review');
    expect(/^[\x00-\x7F]*$/.test(e.text)).toBe(true);
    NO_EM_DASH(e.html);
    const r = buildReviewRequestEmail({ parentName: null, studentFirstName: null, tutorFirstName: null, reviewUrl: url, lang: 'en', reminder: true });
    expect(r.subject).toMatch(/reminder/i);
    expect(r.text).toContain("your child's lessons");
    expect(r.text).not.toContain('with null');
  });

  it('review request in Spanish keeps its accents and speaks to the parent', () => {
    const e = buildReviewRequestEmail({ parentName: 'Carla Pérez', studentFirstName: 'Mateo', tutorFirstName: 'Lenin', reviewUrl: url, lang: 'es' });
    expect(e.subject).toBe('¿Cómo van las clases de Mateo?');
    expect(e.text).toContain('Hola Carla,');
    expect(e.text).toContain('gustaría');
    expect(e.text).toContain(`\n${url}`);
    expect(e.html).toContain('Escribir la reseña');
    NO_EM_DASH(e.html);
  });

  it('owner alert says whether the review may be shown', () => {
    const pub = buildReviewSubmittedAlertEmail({ householdName: 'Nguyen family', rating: 5, body: 'Amy loves maths now.', reviewerName: 'Priya', consentPublic: true, reviewsUrl: 'https://crestio.ai/app/leads/reviews?review=1' });
    expect(pub.subject).toContain('approve to show it');
    expect(pub.text).toContain('Amy loves maths now.');
    const priv = buildReviewSubmittedAlertEmail({ householdName: 'Nguyen family', rating: 2, body: 'Lessons started late twice.', reviewerName: null, consentPublic: false, reviewsUrl: 'https://crestio.ai/app/leads/reviews' });
    expect(priv.subject).toContain('(private)');
    expect(priv.text).toContain('stays private');
  });

  it('prepaid block, low credit and referral emails state exact amounts', () => {
    const b = buildPrepaidBlockEmail({ parentName: 'Priya Nguyen', studentName: 'Amy Nguyen', hours: 10, faceValueCents: 95000, priceCents: 90250, invoiceNumber: 'INV-0042', payUrl: 'https://crestio.ai/pay/tok' });
    expect(b.subject).toBe('Prepaid block for Amy Nguyen: invoice INV-0042');
    expect(b.text).toContain('$950.00');
    expect(b.text).toContain('$902.50');
    expect(b.text).toContain('https://crestio.ai/pay/tok');
    expect(b.html).toContain('Pay by card');
    const l = buildLowCreditEmail({ parentName: 'Priya', householdName: 'Nguyen family', balanceCents: 9500, lessonsLeft: 1, portalUrl: 'https://crestio.ai/parent/dashboard' });
    expect(l.subject).toBe('Your prepaid credit covers about one lesson');
    expect(l.text).toContain('$95.00');
    const r = buildReferralCreditEmail({ parentName: 'Priya', referredHouseholdName: 'Lee family', creditCents: REFERRAL.creditCents, portalUrl: 'https://crestio.ai/parent/dashboard' });
    expect(r.subject).toContain('$50.00');
    expect(r.text).toContain(`${REFERRAL.afterLessons} lessons`);
    for (const e of [b, l, r]) { NO_EM_DASH(e.html); NO_EM_DASH(e.text); expect(/^[\x00-\x7F]*$/.test(e.text)).toBe(true); }
  });

  it('Monday check-in: quiet week and a week with sections', () => {
    const quiet = buildOwnerCheckinEmail({ dateLabel: 'Monday 7 September 2026', sections: [], quiet: true });
    expect(quiet.subject).toBe('Monday check-in, Monday 7 September 2026: quiet week');
    expect(quiet.text).toContain('Nothing is waiting on you');
    const busy = buildOwnerCheckinEmail({
      dateLabel: 'Monday 7 September 2026',
      quiet: false,
      sections: [
        { title: 'Enquiries', lines: ['2 enquiries not yet answered, 1 waiting more than 24 hours: Priya Nguyen (Year 11).'], href: 'https://crestio.ai/app/leads', urgent: true },
        { title: 'Reviews', lines: ['1 review waiting for your approval: Nguyen family (5/5).'], href: 'https://crestio.ai/app/leads/reviews' },
      ],
    });
    expect(busy.subject).toBe('ACTION: Monday check-in, Monday 7 September 2026: 2 things to look at');
    expect(busy.text).toContain('ENQUIRIES (ACTION)');
    expect(busy.text).toContain('- 1 review waiting');
    expect(busy.html).toContain('https://crestio.ai/app/leads/reviews');
    NO_EM_DASH(busy.html);
  });
});

describe('Sydney week boundaries', () => {
  it('midnight is 14:00 UTC the day before in AEST and 13:00 in AEDT', () => {
    expect(sydneyMidnightUtc(2026, 9, 7).toISOString()).toBe('2026-09-06T14:00:00.000Z');
    expect(sydneyMidnightUtc(2026, 12, 7).toISOString()).toBe('2026-12-06T13:00:00.000Z');
  });

  it('the week runs Monday to Monday whatever day the cron fires', () => {
    // Sunday 20:00 UTC = Monday 06:00 AEST 7 September.
    const w = sydneyWeekBounds(new Date('2026-09-06T20:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-09-06T14:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-13T14:00:00.000Z');
    expect(w.label).toBe('Monday 7 September 2026');
    // A Wednesday belongs to the same week.
    const mid = sydneyWeekBounds(new Date('2026-09-09T03:00:00Z'));
    expect(mid.start.toISOString()).toBe('2026-09-06T14:00:00.000Z');
    // Across the DST change (first Sunday in October 2026 is the 4th).
    const dst = sydneyWeekBounds(new Date('2026-10-04T20:00:00Z'));
    expect(dst.start.toISOString()).toBe('2026-10-04T13:00:00.000Z');
    expect(dst.end.toISOString()).toBe('2026-10-11T13:00:00.000Z');
  });
});

describe('shared rate limiter', () => {
  it('uses the database answer when it has one', async () => {
    const client = { rpc: vi.fn(async () => ({ data: { allowed: false, retry_after_seconds: 120 }, error: null })) };
    const r = await checkRateLimitShared(client, { key: 'enquiry:1.2.3.4', limit: 5, windowMs: 3_600_000 });
    expect(r.allowed).toBe(false);
    expect(r.shared).toBe(true);
    if (!r.allowed) expect(r.retry_after_seconds).toBe(120);
    expect(client.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'enquiry:1.2.3.4', p_limit: 5, p_window_seconds: 3600 });
    const ok = await checkRateLimitShared({ rpc: async () => ({ data: { allowed: true, remaining: 3 }, error: null }) }, { key: 'k', limit: 5, windowMs: 60_000 });
    expect(ok.allowed).toBe(true);
    expect(ok.shared).toBe(true);
  });

  it('falls back to memory when the function is missing or the call fails', async () => {
    const missing = { rpc: async () => ({ data: null, error: { message: 'Could not find the function public.rate_limit_hit in the schema cache' } }) };
    const r = await checkRateLimitShared(missing, { key: `fallback:${Math.random()}`, limit: 2, windowMs: 60_000 });
    expect(r.allowed).toBe(true);
    expect(r.shared).toBe(false);
    const throwing = { rpc: async () => { throw new Error('network'); } };
    const key = `fallback2:${Math.random()}`;
    await checkRateLimitShared(throwing, { key, limit: 1, windowMs: 60_000 });
    const second = await checkRateLimitShared(throwing, { key, limit: 1, windowMs: 60_000 });
    expect(second.allowed).toBe(false);
    const none = await checkRateLimitShared(null, { key: `n:${Math.random()}`, limit: 1, windowMs: 60_000 });
    expect(none.shared).toBe(false);
  });
});

describe('chunk 5 wiring', () => {
  it('the migration is present, idempotent in shape, and covers every table the code uses', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260906_agency_chunk5.sql'), 'utf8');
    for (const must of [
      'create table if not exists public.household_credits',
      'create or replace function public.household_credit_balance',
      'create or replace function public.invoices_apply_credit',
      'create or replace function public.invoices_credit_ledger',
      'add column if not exists credit_applied_cents',
      'add column if not exists is_prepaid_block',
      'add column if not exists referred_by_household_id',
      'add column if not exists preferred_language',
      'create table if not exists public.reviews',
      'create or replace function public.rate_limit_hit',
      'alter column payment_token',
      'begin;', 'commit;',
    ]) expect(sql, must).toContain(must);
    expect(sql).not.toContain('drop table');
  });

  it('the two new crons are daily-safe for the Hobby plan and the routes exist', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as { crons: Array<{ path: string; schedule: string }> };
    const daily = vercel.crons.find((c) => c.path === '/api/cron/agency-daily');
    const monday = vercel.crons.find((c) => c.path === '/api/cron/owner-checkin');
    expect(daily?.schedule).toBe('0 22 * * *');
    expect(monday?.schedule).toBe('0 20 * * 0');
    for (const c of vercel.crons) {
      const [min, hour] = c.schedule.split(' ');
      expect(min, c.path).toMatch(/^\d+$/);
      expect(hour, c.path).toMatch(/^\d+$/);
      expect(fs.existsSync(path.join(ROOT, 'pages', `${c.path}.ts`)), c.path).toBe(true);
    }
  });

  it('the review page is public and the reviews tab is in the nav', () => {
    const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8');
    expect(app).toContain("'/review/[token]'");
    const layout = fs.readFileSync(path.join(ROOT, 'components/Layout.tsx'), 'utf8');
    expect(layout).toContain('/app/leads/reviews');
    expect(fs.existsSync(path.join(ROOT, 'pages/review/[token].tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'pages/app/leads/reviews.tsx'))).toBe(true);
  });
});
