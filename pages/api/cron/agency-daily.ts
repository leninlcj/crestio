import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { AGENCY, REFERRAL, REVIEWS } from '../../../lib/agency';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { isMissingTableError } from '../../../lib/dbErrors';
import { isDueReviewReminder, isDueReviewRequest, newReviewToken, type HouseholdLessonFacts, type ReviewLang } from '../../../lib/reviews';
import { buildLowCreditEmail, buildReferralCreditEmail, buildReviewRequestEmail } from '../../../lib/emails/softRun';
import { getHouseholdBalances, lessonsCovered, processReferralCredits } from '../../../lib/householdCredit';

// Vercel Cron, daily (08:00 to 09:00 Sydney). Three jobs for the agency
// organisation, each idempotent through the rows it writes:
//
// 1. Review requests: a family that has had REVIEWS.askAfterLessons completed
//    lessons, at least REVIEWS.minDaysSinceFirstLesson days after the first,
//    with no review row in the last year, gets one email with a private link.
//    One reminder after REVIEWS.reminderAfterDays. Then nothing.
// 2. Referral credit: once a referred family has had REFERRAL.afterLessons
//    lessons, the referring family is credited and told.
// 3. Low credit: a family whose prepaid credit covers fewer than two lessons
//    is told once; the flag resets when they top up.
//
// A missing table (migration not yet run) is reported as setup_required, never
// as a failure.

type HouseholdRow = {
  id: string;
  display_name: string;
  preferred_language: string | null;
  low_credit_notified_at: string | null;
  archived_at: string | null;
};

const DAY = 86_400_000;

async function primaryParent(admin: any, householdId: string): Promise<{ name: string | null; email: string | null }> {
  const { data } = await admin
    .from('household_parents')
    .select('is_primary, parent:parents(name, email)')
    .eq('household_id', householdId)
    .order('is_primary', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as any;
  const parent = row ? (Array.isArray(row.parent) ? row.parent[0] : row.parent) : null;
  if (parent?.email) return { name: parent.name ?? null, email: parent.email };
  const { data: hh } = await admin.from('households').select('billing_email').eq('id', householdId).maybeSingle();
  return { name: null, email: (hh as any)?.billing_email ?? null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  if ((req.headers.authorization ?? '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const org = await getAgencyOrganization(admin);
  if (!org) return res.status(200).json({ ok: true, skipped: 'agency_org_missing' });
  const now = new Date();
  const out: Record<string, unknown> = { ok: true };

  // ---- Households and their students, once. ------------------------------------
  const { data: hhData, error: hhErr } = await admin
    .from('households')
    .select('id, display_name, preferred_language, low_credit_notified_at, archived_at')
    .eq('organization_id', org.id)
    .is('archived_at', null);
  if (hhErr) {
    if (isMissingTableError(hhErr) || /column|schema cache/i.test(hhErr.message)) {
      console.warn('[cron/agency-daily] households columns missing; run the chunk 5 migration', hhErr.message);
      return res.status(200).json({ ok: true, skipped: 'setup_required' });
    }
    return res.status(500).json({ error: hhErr.message });
  }
  const households = (hhData ?? []) as HouseholdRow[];
  const householdIds = households.map((h) => h.id);

  const { data: studentRows } = householdIds.length > 0
    ? await admin.from('students').select('id, name, household_id, primary_tutor_id, hourly_rate_cents').in('household_id', householdIds)
    : { data: [] as any[] };
  const studentsByHousehold = new Map<string, any[]>();
  for (const s of (studentRows ?? []) as any[]) {
    const list = studentsByHousehold.get(s.household_id) ?? [];
    list.push(s);
    studentsByHousehold.set(s.household_id, list);
  }
  const allStudentIds = ((studentRows ?? []) as any[]).map((s) => s.id);

  // ---- 1) Review requests. --------------------------------------------------------
  let requested = 0;
  let reminded = 0;
  try {
    const { data: reviewRows, error: rErr } = await admin
      .from('reviews')
      .select('id, household_id, status, requested_at, reminded_at, token, language, student_id, tutor_id, parent_email, created_at')
      .eq('organization_id', org.id)
      .gte('created_at', new Date(now.getTime() - 365 * DAY).toISOString());
    if (rErr) throw rErr;
    const reviews = (reviewRows ?? []) as any[];
    const householdsWithReview = new Set(reviews.map((r) => r.household_id));

    // Completed lessons per household.
    const { data: sessionRows } = allStudentIds.length > 0
      ? await admin
          .from('sessions')
          .select('student_id, scheduled_at, tutor_id')
          .in('student_id', allStudentIds)
          .eq('status', 'completed')
          .is('deleted_at', null)
          .order('scheduled_at', { ascending: true })
      : { data: [] as any[] };
    const householdOfStudent = new Map<string, string>();
    for (const s of (studentRows ?? []) as any[]) householdOfStudent.set(s.id, s.household_id);
    const facts = new Map<string, HouseholdLessonFacts & { tutor_id: string | null; student_id: string | null }>();
    for (const s of (sessionRows ?? []) as any[]) {
      const hh = householdOfStudent.get(s.student_id);
      if (!hh) continue;
      const f = facts.get(hh) ?? { household_id: hh, completed_lessons: 0, first_lesson_at: null, last_lesson_at: null, has_open_request: householdsWithReview.has(hh), tutor_id: null, student_id: null };
      f.completed_lessons += 1;
      if (!f.first_lesson_at || s.scheduled_at < f.first_lesson_at) f.first_lesson_at = s.scheduled_at;
      if (!f.last_lesson_at || s.scheduled_at > f.last_lesson_at) { f.last_lesson_at = s.scheduled_at; f.tutor_id = s.tutor_id ?? f.tutor_id; f.student_id = s.student_id; }
      facts.set(hh, f);
    }

    for (const h of households) {
      const f = facts.get(h.id);
      if (!f || !isDueReviewRequest(f, now)) continue;
      const parent = await primaryParent(admin, h.id);
      if (!parent.email) continue;
      const lang: ReviewLang = h.preferred_language === 'es' ? 'es' : 'en';
      const student = (studentsByHousehold.get(h.id) ?? []).find((s) => s.id === f.student_id) ?? (studentsByHousehold.get(h.id) ?? [])[0] ?? null;
      const tutorId = f.tutor_id ?? student?.primary_tutor_id ?? null;
      let tutorFirst: string | null = null;
      if (tutorId) {
        const { data: tu } = await admin.from('tutors').select('name').eq('id', tutorId).maybeSingle();
        tutorFirst = ((tu as any)?.name ?? '').split(' ')[0] || null;
      }
      const token = newReviewToken();
      const { error: insErr } = await admin.from('reviews').insert({
        organization_id: org.id,
        household_id: h.id,
        student_id: student?.id ?? null,
        tutor_id: tutorId,
        parent_email: parent.email,
        token,
        language: lang,
        source: 'auto',
        requested_at: now.toISOString(),
        status: 'requested',
      });
      if (insErr) { console.error('[cron/agency-daily] review insert failed', insErr.message); continue; }
      const email = buildReviewRequestEmail({
        parentName: parent.name,
        studentFirstName: student?.name ? String(student.name).split(' ')[0] : null,
        tutorFirstName: tutorFirst,
        reviewUrl: `${AGENCY.siteUrl}/review/${token}`,
        lang,
      });
      const result = await sendEmail({ to: parent.email, subject: email.subject, html: email.html, text: email.text });
      if (!result.success) {
        // Roll the request back so the family is asked again tomorrow rather than never.
        await admin.from('reviews').delete().eq('token', token);
        continue;
      }
      requested += 1;
    }

    // Reminders.
    for (const r of reviews) {
      if (!isDueReviewReminder(r, now)) continue;
      const h = households.find((x) => x.id === r.household_id);
      if (!h || !r.parent_email) continue;
      const student = (studentsByHousehold.get(h.id) ?? []).find((s) => s.id === r.student_id) ?? null;
      let tutorFirst: string | null = null;
      if (r.tutor_id) {
        const { data: tu } = await admin.from('tutors').select('name').eq('id', r.tutor_id).maybeSingle();
        tutorFirst = ((tu as any)?.name ?? '').split(' ')[0] || null;
      }
      const parent = await primaryParent(admin, h.id);
      const email = buildReviewRequestEmail({
        parentName: parent.name,
        studentFirstName: student?.name ? String(student.name).split(' ')[0] : null,
        tutorFirstName: tutorFirst,
        reviewUrl: `${AGENCY.siteUrl}/review/${r.token}`,
        lang: r.language === 'es' ? 'es' : 'en',
        reminder: true,
      });
      const result = await sendEmail({ to: r.parent_email, subject: email.subject, html: email.html, text: email.text });
      if (result.success) {
        await admin.from('reviews').update({ reminded_at: now.toISOString() }).eq('id', r.id);
        reminded += 1;
      }
    }
    out.reviews = { requested, reminded, ask_after: REVIEWS.askAfterLessons };
  } catch (e: any) {
    if (isMissingTableError(e)) out.reviews = { skipped: 'setup_required' };
    else { console.error('[cron/agency-daily] reviews failed', e?.message ?? e); out.reviews = { error: e?.message ?? 'failed' }; }
  }

  // ---- 2) Referral credit. --------------------------------------------------------
  try {
    const result = await processReferralCredits(admin, org.id);
    let told = 0;
    for (const c of result.credited) {
      const parent = await primaryParent(admin, c.referrer_household_id);
      const referred = households.find((h) => h.id === c.referred_household_id);
      if (!parent.email) continue;
      const email = buildReferralCreditEmail({
        parentName: parent.name,
        referredHouseholdName: referred?.display_name ?? 'family',
        creditCents: REFERRAL.creditCents,
        portalUrl: `${AGENCY.siteUrl}/parent/dashboard`,
      });
      const r = await sendEmail({ to: parent.email, subject: email.subject, html: email.html, text: email.text });
      if (r.success) told += 1;
    }
    out.referrals = result.setup_required ? { skipped: 'setup_required' } : { credited: result.credited.length, told };
  } catch (e: any) {
    console.error('[cron/agency-daily] referrals failed', e?.message ?? e);
    out.referrals = { error: e?.message ?? 'failed' };
  }

  // ---- 3) Low credit notices. -------------------------------------------------------
  try {
    const balances = await getHouseholdBalances(admin, householdIds);
    let notified = 0;
    let reset = 0;
    for (const h of households) {
      const bal = balances.get(h.id) ?? 0;
      const rates = (studentsByHousehold.get(h.id) ?? []).map((s) => s.hourly_rate_cents).filter((r) => r && r > 0);
      const rate = rates.length > 0 ? Math.max(...rates) : null;
      if (!rate) continue;
      const left = lessonsCovered(bal, rate);
      const hasCredit = bal > 0;
      const low = hasCredit && left < 2;
      if (low && !h.low_credit_notified_at) {
        const parent = await primaryParent(admin, h.id);
        if (!parent.email) continue;
        const email = buildLowCreditEmail({ parentName: parent.name, householdName: h.display_name, balanceCents: bal, lessonsLeft: left, portalUrl: `${AGENCY.siteUrl}/parent/dashboard` });
        const r = await sendEmail({ to: parent.email, subject: email.subject, html: email.html, text: email.text });
        if (r.success) {
          await admin.from('households').update({ low_credit_notified_at: now.toISOString() }).eq('id', h.id);
          notified += 1;
        }
      } else if (!low && h.low_credit_notified_at && left >= 2) {
        // Topped up: allow a future notice.
        await admin.from('households').update({ low_credit_notified_at: null }).eq('id', h.id);
        reset += 1;
      }
    }
    out.low_credit = { notified, reset };
  } catch (e: any) {
    console.error('[cron/agency-daily] low credit failed', e?.message ?? e);
    out.low_credit = { error: e?.message ?? 'failed' };
  }

  // Owner gets a copy of anything that went wrong, once per run, so a broken
  // job does not stay silent for weeks.
  const errors = Object.values(out).filter((v) => v && typeof v === 'object' && 'error' in (v as object));
  if (errors.length > 0) {
    await sendEmail({
      to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL,
      subject: 'Daily agency job reported an error',
      text: JSON.stringify(out, null, 2),
      html: `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:13px">${JSON.stringify(out, null, 2).replace(/</g, '&lt;')}</pre>`,
    });
  }

  console.info('[cron/agency-daily]', JSON.stringify(out));
  return res.status(200).json(out);
}
