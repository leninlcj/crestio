// The owner's Monday check-in: one email, only the sections that have
// something in them, each with the number, the names that matter and a link.
// Assembled from the same tables the app screens read; nothing is estimated.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENCY } from './agency';
import { isMissingTableError } from './dbErrors';
import { getHouseholdBalances, lessonsCovered } from './householdCredit';
import type { CheckinData, CheckinSection } from './emails/softRun';

type Admin = SupabaseClient<any, any, any>;

const DAY = 86_400_000;

function money(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 00:00 on a Sydney calendar date, as the UTC instant it happens at (handles AEST and AEDT). */
export function sydneyMidnightUtc(year: number, month: number, day: number): Date {
  // 14:00 UTC the day before is midnight AEST; on AEDT it is 01:00, so step back an hour.
  let guess = new Date(Date.UTC(year, month - 1, day, -10));
  const h = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(guess));
  if (h === 1) guess = new Date(guess.getTime() - 3_600_000);
  else if (h === 23) guess = new Date(guess.getTime() + 3_600_000);
  return guess;
}

/** The Sydney week (Monday 00:00 to next Monday 00:00) containing `now`, plus a label for the email. */
export function sydneyWeekBounds(now: Date): { start: Date; end: Date; label: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year); const m = Number(parts.month); const d = Number(parts.day);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(parts.weekday).slice(0, 3));
  const daysSinceMonday = weekdayIndex < 0 ? 0 : (weekdayIndex + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - daysSinceMonday));
  const nextMonday = new Date(Date.UTC(y, m - 1, d - daysSinceMonday + 7));
  const start = sydneyMidnightUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  const end = sydneyMidnightUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate());
  const label = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return { start, end, label };
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (isMissingTableError(e)) return fallback;
    console.warn(`[owner-checkin] ${label} failed:`, e?.message ?? e);
    return fallback;
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const err = new Error(res.error.message) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data as T;
}

export async function assembleOwnerCheckin(admin: Admin, organizationId: string, now: Date = new Date()): Promise<CheckinData> {
  const site = AGENCY.siteUrl;
  const week = sydneyWeekBounds(now);
  const todayIso = now.toISOString().slice(0, 10);
  const sections: CheckinSection[] = [];

  // Enquiries.
  const enquiries = await safe('enquiries', async () => unwrap(await admin
    .from('enquiries')
    .select('id, parent_name, year_level, status, created_at, household_id')
    .eq('organization_id', organizationId)
    .in('status', ['new', 'contacted'])
    .order('created_at', { ascending: true })), [] as any[]);
  const waiting = enquiries.filter((e) => e.status === 'new');
  const stale = waiting.filter((e) => now.getTime() - new Date(e.created_at).getTime() > DAY);
  const contactedNoHome = enquiries.filter((e) => e.status === 'contacted' && !e.household_id && now.getTime() - new Date(e.created_at).getTime() > 7 * DAY);
  if (waiting.length > 0 || contactedNoHome.length > 0) {
    const lines: string[] = [];
    if (waiting.length > 0) lines.push(`${plural(waiting.length, 'enquiry', 'enquiries')} not yet answered${stale.length > 0 ? `, ${stale.length} waiting more than 24 hours: ${stale.map((e) => `${e.parent_name} (${e.year_level})`).join(', ')}` : ''}.`);
    if (contactedNoHome.length > 0) lines.push(`${plural(contactedNoHome.length, 'family', 'families')} contacted more than a week ago and not yet converted: ${contactedNoHome.map((e) => e.parent_name).join(', ')}.`);
    sections.push({ title: 'Enquiries', lines, href: `${site}/app/leads`, urgent: stale.length > 0 });
  }

  // Tutor applications.
  const applications = await safe('applications', async () => unwrap(await admin
    .from('tutor_applications')
    .select('id, full_name, status, created_at, interview_at')
    .eq('organization_id', organizationId)
    .in('status', ['new', 'screening', 'interview', 'test', 'offer'])), [] as any[]);
  if (applications.length > 0) {
    const byStatus = new Map<string, number>();
    for (const a of applications) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
    const order = ['new', 'screening', 'interview', 'test', 'offer'];
    const summary = order.filter((s) => byStatus.has(s)).map((s) => `${byStatus.get(s)} ${s}`).join(', ');
    const interviewsThisWeek = applications.filter((a) => a.interview_at && new Date(a.interview_at) >= week.start && new Date(a.interview_at) < week.end);
    const lines = [`${plural(applications.length, 'application')} in progress: ${summary}.`];
    if (interviewsThisWeek.length > 0) lines.push(`Interviews this week: ${interviewsThisWeek.map((a) => `${a.full_name} (${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(a.interview_at))})`).join(', ')}.`);
    sections.push({ title: 'Tutor applications', lines, href: `${site}/app/leads/applications` });
  }

  // Tutors: WWCC and agreement.
  const tutors = await safe('tutors', async () => unwrap(await admin
    .from('tutors')
    .select('id, name, auth_user_id, wwcc_number, wwcc_expiry, wwcc_verified_at, agreement_accepted_at')
    .eq('organization_id', organizationId)
    .eq('archived', false)
    .not('auth_user_id', 'is', null)), [] as any[]);
  const wwccProblems: string[] = [];
  for (const t of tutors) {
    if (!t.wwcc_number || !t.wwcc_verified_at) { wwccProblems.push(`${t.name}: WWCC not verified`); continue; }
    if (t.wwcc_expiry) {
      const days = Math.ceil((new Date(t.wwcc_expiry).getTime() - now.getTime()) / DAY);
      if (days < 0) wwccProblems.push(`${t.name}: WWCC expired ${-days} days ago, stand down`);
      else if (days <= 60) wwccProblems.push(`${t.name}: WWCC expires in ${days} days`);
    }
    if (!t.agreement_accepted_at) wwccProblems.push(`${t.name}: has not accepted the tutor agreement`);
  }
  if (wwccProblems.length > 0) {
    sections.push({ title: 'Tutors', lines: wwccProblems, href: `${site}/app/tutors`, urgent: wwccProblems.some((l) => /expired/.test(l)) });
  }

  // Money: overdue and outstanding invoices, unbilled lessons, payouts owed.
  const openInvoices = await safe('invoices', async () => unwrap(await admin
    .from('invoices')
    .select('id, number, total_cents, due_on, status, household:households(display_name), student:students(name)')
    .eq('organization_id', organizationId)
    .in('status', ['sent', 'overdue'])
    .gt('total_cents', 0)), [] as any[]);
  const overdue = openInvoices.filter((i) => i.due_on && i.due_on < todayIso);
  const dueLater = openInvoices.filter((i) => !i.due_on || i.due_on >= todayIso);
  const nameOf = (i: any) => (Array.isArray(i.household) ? i.household[0]?.display_name : i.household?.display_name) ?? (Array.isArray(i.student) ? i.student[0]?.name : i.student?.name) ?? i.number;
  const moneyLines: string[] = [];
  if (overdue.length > 0) moneyLines.push(`${plural(overdue.length, 'invoice')} overdue, ${money(overdue.reduce((a, i) => a + i.total_cents, 0))}: ${overdue.slice(0, 6).map((i) => `${nameOf(i)} ${i.number} (due ${i.due_on})`).join(', ')}${overdue.length > 6 ? ', and more' : ''}.`);
  if (dueLater.length > 0) moneyLines.push(`${plural(dueLater.length, 'invoice')} sent and not yet due, ${money(dueLater.reduce((a, i) => a + i.total_cents, 0))}.`);

  const unbilled = await safe('unbilled', async () => unwrap(await admin
    .from('unbilled_completed_sessions')
    .select('id, duration_minutes, charge_rate_cents, scheduled_at')
    .eq('organization_id', organizationId)
    .lt('scheduled_at', week.start.toISOString())), [] as any[]);
  if (unbilled.length > 0) {
    const value = unbilled.reduce((a, s) => a + Math.round(((s.charge_rate_cents ?? 0) * (s.duration_minutes ?? 0)) / 60), 0);
    moneyLines.push(`${plural(unbilled.length, 'completed lesson')} from before this week not yet invoiced${value > 0 ? `, about ${money(value)}` : ''}. Batch invoice them.`);
  }

  const owed = await safe('payouts', async () => unwrap(await admin
    .from('sessions')
    .select('id, duration_minutes, pay_rate_cents, tutor_id, tutor:tutors(name)')
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .eq('paid', false)
    .not('pay_rate_cents', 'is', null)
    .is('deleted_at', null)
    .lt('scheduled_at', week.start.toISOString())), [] as any[]);
  if (owed.length > 0) {
    const byTutor = new Map<string, number>();
    for (const s of owed) {
      const name = (Array.isArray(s.tutor) ? s.tutor[0]?.name : s.tutor?.name) ?? 'Unassigned';
      byTutor.set(name, (byTutor.get(name) ?? 0) + Math.round(((s.pay_rate_cents ?? 0) * (s.duration_minutes ?? 0)) / 60));
    }
    const total = Array.from(byTutor.values()).reduce((a, b) => a + b, 0);
    if (total > 0) moneyLines.push(`Tutor payouts owed for lessons before this week: ${money(total)} (${Array.from(byTutor.entries()).map(([n, c]) => `${n} ${money(c)}`).join(', ')}). Pay them and mark the sessions paid.`);
  }
  if (moneyLines.length > 0) {
    sections.push({ title: 'Money', lines: moneyLines, href: `${site}/app/invoices`, urgent: overdue.length > 0 });
  }

  // This week's lessons.
  const thisWeek = await safe('sessions-week', async () => unwrap(await admin
    .from('sessions')
    .select('id, status, tutor:tutors(name)')
    .eq('organization_id', organizationId)
    .gte('scheduled_at', week.start.toISOString())
    .lt('scheduled_at', week.end.toISOString())
    .is('deleted_at', null)), [] as any[]);
  const lastWeek = await safe('sessions-last-week', async () => unwrap(await admin
    .from('sessions')
    .select('id, status, late_cancellation, cancellation_waived')
    .eq('organization_id', organizationId)
    .gte('scheduled_at', new Date(week.start.getTime() - 7 * DAY).toISOString())
    .lt('scheduled_at', week.start.toISOString())
    .is('deleted_at', null)), [] as any[]);
  if (thisWeek.length > 0 || lastWeek.length > 0) {
    const lines: string[] = [];
    const scheduled = thisWeek.filter((s) => s.status !== 'cancelled');
    if (scheduled.length > 0) {
      const byTutor = new Map<string, number>();
      for (const s of scheduled) {
        const name = (Array.isArray(s.tutor) ? s.tutor[0]?.name : s.tutor?.name) ?? 'Unassigned';
        byTutor.set(name, (byTutor.get(name) ?? 0) + 1);
      }
      lines.push(`${plural(scheduled.length, 'lesson')} scheduled this week: ${Array.from(byTutor.entries()).map(([n, c]) => `${n} ${c}`).join(', ')}.`);
    }
    const completed = lastWeek.filter((s) => s.status === 'completed').length;
    const late = lastWeek.filter((s) => s.status === 'cancelled' && s.late_cancellation && !s.cancellation_waived).length;
    const unlogged = lastWeek.filter((s) => s.status === 'scheduled' || s.status === 'confirmed').length;
    if (lastWeek.length > 0) lines.push(`Last week: ${plural(completed, 'lesson')} completed${late > 0 ? `, ${plural(late, 'late cancellation')} charged` : ''}${unlogged > 0 ? `, ${unlogged} still marked scheduled (log or cancel them)` : ''}.`);
    sections.push({ title: 'Lessons', lines, href: `${site}/app/sessions`, urgent: false });
  }

  // Reviews.
  const reviews = await safe('reviews', async () => unwrap(await admin
    .from('reviews')
    .select('id, status, rating, requested_at, household:households(display_name)')
    .eq('organization_id', organizationId)
    .in('status', ['submitted', 'requested'])), [] as any[]);
  const submitted = reviews.filter((r) => r.status === 'submitted');
  const requested = reviews.filter((r) => r.status === 'requested');
  if (submitted.length > 0 || requested.length > 0) {
    const lines: string[] = [];
    if (submitted.length > 0) lines.push(`${plural(submitted.length, 'review')} waiting for your approval: ${submitted.map((r) => `${(Array.isArray(r.household) ? r.household[0]?.display_name : r.household?.display_name) ?? 'a family'} (${r.rating}/5)`).join(', ')}.`);
    if (requested.length > 0) lines.push(`${plural(requested.length, 'request')} sent and not yet answered.`);
    sections.push({ title: 'Reviews', lines, href: `${site}/app/leads/reviews`, urgent: false });
  }

  // Prepaid credit running low or negative.
  const households = await safe('households', async () => unwrap(await admin
    .from('households')
    .select('id, display_name, students:students(hourly_rate_cents)')
    .eq('organization_id', organizationId)
    .is('archived_at', null)), [] as any[]);
  const balances = await safe('balances', () => getHouseholdBalances(admin, households.map((h) => h.id)), new Map<string, number>());
  const creditLines: string[] = [];
  for (const h of households) {
    const bal = balances.get(h.id) ?? 0;
    if (bal === 0) continue;
    const rates = ((Array.isArray(h.students) ? h.students : []) as any[]).map((s) => s.hourly_rate_cents).filter((r) => r && r > 0);
    const rate = rates.length > 0 ? Math.max(...rates) : null;
    if (bal < 0) creditLines.push(`${h.display_name}: credit is negative (${money(bal)}), a refunded block was already spent; collect or adjust.`);
    else if (rate && lessonsCovered(bal, rate) < 2) creditLines.push(`${h.display_name}: ${money(bal)} left, ${lessonsCovered(bal, rate)} lesson(s). They have been told.`);
  }
  if (creditLines.length > 0) sections.push({ title: 'Prepaid credit', lines: creditLines, href: `${site}/app/households`, urgent: creditLines.some((l) => /negative/.test(l)) });

  // Open incidents.
  const incidents = await safe('incidents', async () => unwrap(await admin
    .from('incidents')
    .select('id, category, status, created_at')
    .eq('organization_id', organizationId)
    .in('status', ['open', 'reviewing'])), [] as any[]);
  if (incidents.length > 0) {
    sections.push({ title: 'Reports', lines: [`${plural(incidents.length, 'report')} open (${incidents.map((i) => i.category).join(', ')}). Every one is a child-safe record; close them with an outcome.`], href: `${site}/app/leads/incidents`, urgent: incidents.some((i) => i.category === 'safety') });
  }

  return { dateLabel: week.label, sections, quiet: sections.length === 0 };
}
