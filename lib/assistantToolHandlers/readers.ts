import type {
  GetUpcomingSessionsInput,
  GetRecentSessionsInput,
  GetStudentSummaryInput,
  GetUnpaidInvoicesInput,
  GetEarningsSummaryInput,
  SearchStudentsInput,
  GetRecentMessagesInput,
  GetRecentNotificationsInput,
  GetStudentHomeworkStatusInput,
  ListPendingHomeworkInput,
  GetHouseholdInput,
  ListHouseholdsInput,
  FindHouseholdByNameInput,
  GetUnbilledSummaryInput,
} from '../assistantTools';
import { getUnbilledSessions } from '../billing/unbilledSessions';
import { groupSessionsByHousehold, periodPreset } from '../billing/groupSessionsByHousehold';
import {
  ToolCallerContext,
  resolveStudent,
  formatAuDate,
  formatAuDateTime,
  formatAuDateShort,
  formatCentsAud,
  startOfDayIso,
  endOfDayIso,
  firstName,
} from './shared';

// Read-tool handlers return a compact JSON-safe object that Claude turns into
// prose. Keep results small — ~1KB upper bound per call.

type ReadResult = Record<string, any>;

// ---------------------------------------------------------------------------
// get_upcoming_sessions
// ---------------------------------------------------------------------------

export async function handleGetUpcomingSessions(
  ctx: ToolCallerContext,
  input: GetUpcomingSessionsInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const raw = typeof input.days_ahead === 'number' ? input.days_ahead : 7;
  const days = Math.max(1, Math.min(30, Math.round(raw)));

  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);

  let q = client
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', endOfDayIso(until))
    .in('status', ['scheduled'])
    .order('scheduled_at', { ascending: true })
    .limit(40);
  if (membership.role === 'tutor') {
    q = q.eq('tutor_user_id', membership.user_id);
  }

  const { data } = await q;
  const sessions = (data ?? []).map((s: any) => ({
    id: s.id,
    student_name: s.student?.name ?? 'Unknown',
    when: formatAuDateTime(s.scheduled_at),
    duration_minutes: s.duration_minutes,
    subject: s.subject ?? null,
    topic: s.topic ?? null,
  }));

  return {
    days_ahead: days,
    count: sessions.length,
    sessions,
  };
}

// ---------------------------------------------------------------------------
// get_recent_sessions
// ---------------------------------------------------------------------------

export async function handleGetRecentSessions(
  ctx: ToolCallerContext,
  input: GetRecentSessionsInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const raw = typeof input.days_back === 'number' ? input.days_back : 7;
  const days = Math.max(1, Math.min(30, Math.round(raw)));

  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);

  let studentFilterId: string | null = null;
  if (input.student_name_or_id && input.student_name_or_id.trim()) {
    const r = await resolveStudent(ctx, input.student_name_or_id.trim());
    if (r.kind === 'none') {
      return { error: `No student matching "${input.student_name_or_id}".`, suggestions: r.suggestions };
    }
    if (r.kind === 'many') {
      return {
        error: `Multiple students match "${input.student_name_or_id}".`,
        matches: r.students.map((s) => s.name),
      };
    }
    studentFilterId = r.student.id;
  }

  let q = client
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, invoice_id, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .gte('scheduled_at', startOfDayIso(since))
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(40);
  if (membership.role === 'tutor') q = q.eq('tutor_user_id', membership.user_id);
  if (studentFilterId) q = q.eq('student_id', studentFilterId);

  const { data } = await q;
  const sessions = (data ?? []).map((s: any) => ({
    id: s.id,
    student_name: s.student?.name ?? 'Unknown',
    when: formatAuDateTime(s.scheduled_at),
    duration_minutes: s.duration_minutes,
    subject: s.subject ?? null,
    topic: s.topic ?? null,
    status: s.status,
    invoiced: !!s.invoice_id,
    parent_notes_snippet: snippet(s.notes_parent_facing, 120),
  }));

  return {
    days_back: days,
    count: sessions.length,
    sessions,
  };
}

// ---------------------------------------------------------------------------
// get_student_summary
// ---------------------------------------------------------------------------

export async function handleGetStudentSummary(
  ctx: ToolCallerContext,
  input: GetStudentSummaryInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') {
    return {
      error: `No student matching "${input.student_name_or_id}".`,
      suggestions: r.suggestions,
    };
  }
  if (r.kind === 'many') {
    return {
      ambiguous: true,
      matches: r.students.map((s) => ({ id: s.id, name: s.name, year_level: s.year_level })),
    };
  }
  const student = r.student;

  // Primary tutor name (may be null)
  let primaryTutorName: string | null = null;
  if (student.primary_tutor_id) {
    const { data: t } = await client
      .from('tutors')
      .select('name')
      .eq('id', student.primary_tutor_id)
      .maybeSingle();
    primaryTutorName = t?.name ?? null;
  }

  // Recent + upcoming sessions
  const nowIso = new Date().toISOString();
  const recentQ = client
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, notes_parent_facing, invoice_id')
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: false })
    .limit(3);
  const upcomingQ = client
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject')
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id)
    .gt('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(3);

  const [recentRes, upcomingRes] = await Promise.all([recentQ, upcomingQ]);

  // Total count + first session date
  const { count: totalCount } = await client
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id);
  const { data: firstSess } = await client
    .from('sessions')
    .select('scheduled_at')
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Outstanding balance (unpaid invoices)
  const { data: unpaidInv } = await client
    .from('invoices')
    .select('total_cents, status')
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id)
    .neq('status', 'paid')
    .neq('status', 'void');
  const outstandingCents = (unpaidInv ?? []).reduce((a: number, i: any) => a + (i.total_cents ?? 0), 0);

  // Parent contacts (from parent_student_links -> parents)
  const { data: links } = await client
    .from('parent_student_links')
    .select('revoked_at, created_at, parent:parents!inner(name, email, auth_user_id)')
    .eq('student_id', student.id)
    .is('revoked_at', null);
  const parentContacts = ((links ?? []) as any[]).map((l) => ({
    name: l.parent?.name ?? null,
    email: l.parent?.email ?? null,
    portal_access: true,
    invited_at: l.created_at,
  }));
  // Fallback: non-portal parent listed on the student record
  if (parentContacts.length === 0 && (student.parent_name || student.parent_email)) {
    parentContacts.push({
      name: student.parent_name,
      email: student.parent_email,
      portal_access: false,
      invited_at: null,
    });
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      year_level: student.year_level,
      subject: student.subjects && student.subjects.length > 0 ? student.subjects[0] : null,
      charge_rate_cents: student.hourly_rate_cents,
      charge_rate_display: student.hourly_rate_cents != null ? `${formatCentsAud(student.hourly_rate_cents)}/hr` : null,
      primary_tutor_name: primaryTutorName,
    },
    recent_sessions: (recentRes.data ?? []).map((s: any) => ({
      id: s.id,
      when: formatAuDate(s.scheduled_at),
      duration_minutes: s.duration_minutes,
      subject: s.subject,
      parent_notes_snippet: snippet(s.notes_parent_facing, 120),
      invoiced: !!s.invoice_id,
    })),
    upcoming_sessions: (upcomingRes.data ?? []).map((s: any) => ({
      id: s.id,
      when: formatAuDateTime(s.scheduled_at),
      duration_minutes: s.duration_minutes,
      subject: s.subject,
    })),
    outstanding_balance_cents: outstandingCents,
    outstanding_balance_display: outstandingCents > 0 ? formatCentsAud(outstandingCents) : '$0',
    parent_contacts: parentContacts,
    total_sessions_logged: totalCount ?? 0,
    student_since: firstSess?.scheduled_at ? formatAuDate(firstSess.scheduled_at) : null,
  };
}

// ---------------------------------------------------------------------------
// get_unpaid_invoices
// ---------------------------------------------------------------------------

export async function handleGetUnpaidInvoices(
  ctx: ToolCallerContext,
  input: GetUnpaidInvoicesInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;

  let studentFilterId: string | null = null;
  if (input.student_name_or_id && input.student_name_or_id.trim()) {
    const r = await resolveStudent(ctx, input.student_name_or_id.trim());
    if (r.kind === 'none') return { error: `No student matching "${input.student_name_or_id}".`, suggestions: r.suggestions };
    if (r.kind === 'many') return { error: `Multiple students match.`, matches: r.students.map((s) => s.name) };
    studentFilterId = r.student.id;
  }

  let q = client
    .from('invoices')
    .select('id, number, issued_on, due_on, total_cents, status, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .neq('status', 'paid')
    .neq('status', 'void')
    .order('issued_on', { ascending: true })
    .limit(50);
  if (studentFilterId) q = q.eq('student_id', studentFilterId);

  const { data } = await q;
  const today = new Date();
  const invoices = (data ?? []).map((i: any) => {
    const dueDate = i.due_on ? new Date(i.due_on) : null;
    const daysOverdue = dueDate
      ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000))
      : 0;
    return {
      id: i.id,
      number: i.number,
      student_name: i.student?.name,
      amount_display: formatCentsAud(i.total_cents ?? 0),
      amount_cents: i.total_cents ?? 0,
      issued_on: i.issued_on,
      due_on: i.due_on,
      days_overdue: daysOverdue,
      status: i.status,
    };
  });

  const totalOutstanding = invoices.reduce((a, i) => a + i.amount_cents, 0);

  return {
    count: invoices.length,
    total_outstanding_display: formatCentsAud(totalOutstanding),
    invoices,
  };
}

// ---------------------------------------------------------------------------
// get_earnings_summary
// ---------------------------------------------------------------------------

export async function handleGetEarningsSummary(
  ctx: ToolCallerContext,
  input: GetEarningsSummaryInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;

  const range = resolvePeriod(input);
  if (!range) return { error: "Invalid period. Use this_week, last_week, this_month, last_month, or custom with from/to." };

  let q = client
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, charge_rate_cents, invoice_id, status, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .gte('scheduled_at', range.fromIso)
    .lte('scheduled_at', range.toIso)
    .eq('status', 'completed')
    .limit(500);
  if (membership.role === 'tutor') q = q.eq('tutor_user_id', membership.user_id);

  const { data: sessions } = await q;
  const list = (sessions ?? []) as any[];

  const invoiceIds = Array.from(new Set(list.map((s) => s.invoice_id).filter(Boolean)));
  let paidInvoiceIdSet = new Set<string>();
  if (invoiceIds.length > 0) {
    const { data: invs } = await client
      .from('invoices')
      .select('id, status')
      .in('id', invoiceIds);
    paidInvoiceIdSet = new Set((invs ?? []).filter((i: any) => i.status === 'paid').map((i: any) => i.id));
  }

  let gross = 0, paid = 0, hoursMin = 0, paidCount = 0;
  const byStudent = new Map<string, { name: string; sessions: number; mins: number; cents: number }>();
  for (const s of list) {
    const cents = Math.round(((s.charge_rate_cents ?? 0) * (s.duration_minutes ?? 0)) / 60);
    gross += cents;
    hoursMin += s.duration_minutes ?? 0;
    const isPaid = s.invoice_id && paidInvoiceIdSet.has(s.invoice_id);
    if (isPaid) { paid += cents; paidCount++; }
    const key = s.student?.id ?? 'unknown';
    const name = s.student?.name ?? 'Unknown';
    const existing = byStudent.get(key) ?? { name, sessions: 0, mins: 0, cents: 0 };
    existing.sessions++;
    existing.mins += s.duration_minutes ?? 0;
    existing.cents += cents;
    byStudent.set(key, existing);
  }

  const breakdown = Array.from(byStudent.values())
    .sort((a, b) => b.cents - a.cents)
    .map((b) => ({
      name: b.name,
      sessions_count: b.sessions,
      hours: round1(b.mins / 60),
      total_display: formatCentsAud(b.cents),
    }));

  return {
    period_label: range.label,
    sessions_count: list.length,
    sessions_paid_count: paidCount,
    gross_display: formatCentsAud(gross),
    paid_display: formatCentsAud(paid),
    outstanding_display: formatCentsAud(gross - paid),
    hours_taught: round1(hoursMin / 60),
    breakdown_by_student: breakdown.slice(0, 12),
  };
}

function resolvePeriod(input: GetEarningsSummaryInput): { fromIso: string; toIso: string; label: string } | null {
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const weekStart = (d: Date) => {
    const day = d.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day; // Monday-start
    const x = new Date(d);
    x.setDate(d.getDate() + diff);
    return dayStart(x);
  };
  const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

  switch (input.period) {
    case 'this_week': {
      const from = weekStart(now);
      const to = dayEnd(new Date(from.getTime() + 6 * 86_400_000));
      return { fromIso: from.toISOString(), toIso: to.toISOString(), label: `This week (${fmt(from)} – ${fmt(to)})` };
    }
    case 'last_week': {
      const thisStart = weekStart(now);
      const from = new Date(thisStart.getTime() - 7 * 86_400_000);
      const to = dayEnd(new Date(from.getTime() + 6 * 86_400_000));
      return { fromIso: from.toISOString(), toIso: to.toISOString(), label: `Last week (${fmt(from)} – ${fmt(to)})` };
    }
    case 'this_month': {
      const from = monthStart(now);
      const to = dayEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { fromIso: from.toISOString(), toIso: to.toISOString(), label: `This month (${fmt(from)} – ${fmt(to)})` };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = dayEnd(new Date(now.getFullYear(), now.getMonth(), 0));
      return { fromIso: from.toISOString(), toIso: to.toISOString(), label: `Last month (${fmt(from)} – ${fmt(to)})` };
    }
    case 'custom': {
      if (!input.from || !input.to) return null;
      const from = dayStart(new Date(input.from));
      const to = dayEnd(new Date(input.to));
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
      return { fromIso: from.toISOString(), toIso: to.toISOString(), label: `${fmt(from)} – ${fmt(to)}` };
    }
    default:
      return null;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// search_students
// ---------------------------------------------------------------------------

export async function handleSearchStudents(
  ctx: ToolCallerContext,
  input: SearchStudentsInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const raw = (input.query ?? '').trim();
  if (!raw) return { error: 'query required.' };

  let q = client
    .from('students')
    .select('id, name, year_level, subjects, parent_name, parent_email, primary_tutor_id')
    .eq('organization_id', membership.organization_id)
    .eq('archived', false)
    .eq('is_test_record', false)
    .or(
      `name.ilike.%${raw}%,parent_name.ilike.%${raw}%,parent_email.ilike.%${raw}%`,
    )
    .limit(5);
  if (membership.role === 'tutor' && membership.tutor_id) {
    q = q.eq('primary_tutor_id', membership.tutor_id);
  }

  const { data } = await q;
  const list = (data ?? []) as any[];
  if (list.length === 0) {
    return { count: 0, matches: [] };
  }

  // Optional: next session per student.
  const ids = list.map((s) => s.id);
  const { data: nextSessions } = await client
    .from('sessions')
    .select('id, student_id, scheduled_at, subject')
    .eq('organization_id', membership.organization_id)
    .in('student_id', ids)
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  const nextByStudent = new Map<string, any>();
  for (const s of nextSessions ?? []) {
    if (!nextByStudent.has(s.student_id)) nextByStudent.set(s.student_id, s);
  }

  return {
    count: list.length,
    matches: list.map((s) => ({
      id: s.id,
      name: s.name,
      year_level: s.year_level,
      subject: s.subjects && s.subjects.length > 0 ? s.subjects[0] : null,
      parent_name: s.parent_name,
      parent_email: s.parent_email,
      next_session: nextByStudent.has(s.id)
        ? {
            when: formatAuDateTime(nextByStudent.get(s.id).scheduled_at),
            subject: nextByStudent.get(s.id).subject,
          }
        : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_recent_messages — latest messages in the thread about a student.
// ---------------------------------------------------------------------------

export async function handleGetRecentMessages(
  ctx: ToolCallerContext,
  input: GetRecentMessagesInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') {
    return { error: `No student matching "${input.student_name_or_id}".`, suggestions: r.suggestions };
  }
  if (r.kind === 'many') {
    return { error: 'Multiple students match. Be more specific.', matches: r.students.map((s) => s.name) };
  }
  const student = r.student;
  const limit = Math.max(1, Math.min(20, Math.round(input.limit ?? 5)));

  // Find the thread(s) that apply. For owners there may be several parent
  // threads; for tutors only theirs will RLS-through.
  const { data: threads } = await client
    .from('message_threads')
    .select('id, parent_id, last_message_at, parent:parents!inner(id, name)')
    .eq('student_id', student.id);
  const threadList = (threads ?? []) as any[];
  if (threadList.length === 0) {
    return { student_name: student.name, thread_count: 0, messages: [] };
  }

  const threadIds = threadList.map((t) => t.id);
  const { data: msgs } = await client
    .from('messages')
    .select('thread_id, sender_type, body, urgency, created_at')
    .in('thread_id', threadIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  const parentNameByThread = new Map<string, string | null>();
  for (const t of threadList) parentNameByThread.set(t.id, t.parent?.name ?? null);

  return {
    student_name: student.name,
    thread_count: threadList.length,
    messages: ((msgs ?? []) as any[]).map((m) => ({
      sender_type: m.sender_type,
      parent_name: parentNameByThread.get(m.thread_id) ?? null,
      body_snippet: snippet(m.body, 160),
      urgency: m.urgency,
      when: formatAuDateTime(m.created_at),
    })),
  };
}

// ---------------------------------------------------------------------------
// get_recent_notifications — recent in-app notifications for the caller.
// ---------------------------------------------------------------------------

export async function handleGetRecentNotifications(
  ctx: ToolCallerContext,
  input: GetRecentNotificationsInput,
): Promise<ReadResult> {
  const { client } = ctx;
  const limit = Math.max(1, Math.min(20, Math.round(input.limit ?? 5)));
  const { data } = await client
    .from('notifications')
    .select('id, type, title, body, link_url, created_at, read_at')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as any[];
  return {
    count: rows.length,
    unread_count: rows.filter((r) => !r.read_at).length,
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body_snippet: snippet(r.body, 140),
      when: formatAuDateTime(r.created_at),
      unread: !r.read_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_student_homework_status
// ---------------------------------------------------------------------------

export async function handleGetStudentHomeworkStatus(
  ctx: ToolCallerContext,
  input: GetStudentHomeworkStatusInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const raw = (input.student_name_or_id ?? '').trim();
  if (!raw) return { error: 'student_name_or_id is required.' };

  const r = await resolveStudent(ctx, raw);
  if (r.kind === 'none') {
    return { error: `No student found matching "${raw}".` };
  }
  if (r.kind === 'many') {
    return { error: `Multiple students match "${raw}": ${r.students.map((s) => s.name).join(', ')}.` };
  }
  const student = r.student;

  let q = client
    .from('sessions')
    .select('id, scheduled_at, homework_description, homework, homework_due_date, homework_completed_at, homework_completed_by_user_id')
    .eq('organization_id', membership.organization_id)
    .eq('student_id', student.id)
    .not('homework_description', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(5);
  if (membership.role === 'tutor') {
    q = q.eq('tutor_user_id', membership.user_id);
  }
  const { data } = await q;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return {
      student_name: student.name,
      homework: [],
      summary: `${student.name} has no homework on record.`,
    };
  }

  const now = new Date();
  return {
    student_name: student.name,
    homework: rows.map((s) => ({
      session_date: formatAuDateShort(s.scheduled_at),
      description: s.homework_description || s.homework,
      due_date: s.homework_due_date,
      completed_at: s.homework_completed_at,
      status: s.homework_completed_at
        ? 'done'
        : (s.homework_due_date && new Date(s.homework_due_date) < now ? 'overdue' : 'pending'),
    })),
  };
}

// ---------------------------------------------------------------------------
// list_pending_homework
// ---------------------------------------------------------------------------

export async function handleListPendingHomework(
  ctx: ToolCallerContext,
  _input: ListPendingHomeworkInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  let q = client
    .from('sessions')
    .select('id, homework_description, homework, homework_due_date, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .not('homework_description', 'is', null)
    .is('homework_completed_at', null)
    .gte('homework_due_date', cutoff)
    .order('homework_due_date', { ascending: true })
    .limit(10);
  if (membership.role === 'tutor') {
    q = q.eq('tutor_user_id', membership.user_id);
  }
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const now = new Date();
  return {
    count: rows.length,
    pending: rows.map((s) => ({
      student_name: s.student?.name ?? 'Unknown',
      description: snippet(s.homework_description || s.homework, 120),
      due_date: s.homework_due_date,
      overdue: s.homework_due_date ? new Date(s.homework_due_date) < now : false,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_household
// ---------------------------------------------------------------------------

export async function handleGetHousehold(
  ctx: ToolCallerContext,
  input: GetHouseholdInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const id = (input.household_id ?? '').trim();
  if (!id) return { error: 'household_id is required.' };

  const { data: household } = await client
    .from('households')
    .select('id, display_name, billing_email, notes, archived_at, organization_id')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!household) return { error: 'Household not found.' };

  const [parentsRes, studentsRes] = await Promise.all([
    client
      .from('household_parents')
      .select('is_primary, parent:parents!inner(id, name, email)')
      .eq('household_id', id),
    client
      .from('students')
      .select('id, name, year_level')
      .eq('household_id', id)
      .eq('archived', false)
      .order('name'),
  ]);

  return {
    id: household.id,
    display_name: household.display_name,
    billing_email: household.billing_email,
    notes: household.notes,
    archived: !!household.archived_at,
    parents: ((parentsRes.data ?? []) as any[]).map((r) => ({
      name: r.parent?.name ?? null,
      email: r.parent?.email ?? null,
      is_primary: !!r.is_primary,
    })),
    students: (studentsRes.data ?? []).map((s: any) => ({
      id: s.id, name: s.name, year_level: s.year_level,
    })),
  };
}

// ---------------------------------------------------------------------------
// list_households
// ---------------------------------------------------------------------------

export async function handleListHouseholds(
  ctx: ToolCallerContext,
  input: ListHouseholdsInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const limit = Math.max(1, Math.min(50, Math.round(input.limit ?? 20)));
  const { data: households } = await client
    .from('households')
    .select('id, display_name')
    .eq('organization_id', membership.organization_id)
    .is('archived_at', null)
    .order('display_name')
    .limit(limit);
  const ids = (households ?? []).map((h: any) => h.id);
  if (ids.length === 0) return { count: 0, households: [] };

  const { data: students } = await client
    .from('students')
    .select('household_id, name')
    .in('household_id', ids)
    .eq('archived', false);
  const studentsByHouse = new Map<string, string[]>();
  for (const s of (students ?? []) as any[]) {
    const arr = studentsByHouse.get(s.household_id) ?? [];
    arr.push(s.name);
    studentsByHouse.set(s.household_id, arr);
  }
  return {
    count: (households ?? []).length,
    households: (households ?? []).map((h: any) => ({
      id: h.id,
      display_name: h.display_name,
      students: studentsByHouse.get(h.id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// find_household_by_name
// ---------------------------------------------------------------------------

export async function handleFindHouseholdByName(
  ctx: ToolCallerContext,
  input: FindHouseholdByNameInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  const name = (input.name ?? '').trim();
  if (!name) return { error: 'name is required.' };

  // Match either household name or a linked parent's name.
  const [{ data: byName }, { data: links }] = await Promise.all([
    client
      .from('households')
      .select('id, display_name')
      .eq('organization_id', membership.organization_id)
      .is('archived_at', null)
      .ilike('display_name', `%${name}%`)
      .limit(5),
    client
      .from('household_parents')
      .select('household_id, parent:parents!inner(name)')
      .ilike('parent.name', `%${name}%`)
      .limit(10),
  ]);

  const households = new Map<string, { id: string; display_name: string }>();
  for (const h of (byName ?? []) as any[]) {
    households.set(h.id, { id: h.id, display_name: h.display_name });
  }

  const linkHouseholdIds = Array.from(new Set(((links ?? []) as any[]).map((l) => l.household_id).filter(Boolean)));
  if (linkHouseholdIds.length > 0) {
    const { data: extras } = await client
      .from('households')
      .select('id, display_name')
      .in('id', linkHouseholdIds)
      .eq('organization_id', membership.organization_id)
      .is('archived_at', null);
    for (const h of (extras ?? []) as any[]) {
      if (!households.has(h.id)) households.set(h.id, { id: h.id, display_name: h.display_name });
    }
  }

  const rows = Array.from(households.values()).slice(0, 5);
  if (rows.length === 0) {
    return { matches: [], summary: `No household found matching "${name}".` };
  }
  // Resolve student names per matched household.
  const ids = rows.map((r) => r.id);
  const { data: students } = await client
    .from('students').select('id, name, household_id')
    .in('household_id', ids).eq('archived', false);
  const studentsByHouse = new Map<string, string[]>();
  for (const s of (students ?? []) as any[]) {
    const arr = studentsByHouse.get(s.household_id) ?? [];
    arr.push(s.name);
    studentsByHouse.set(s.household_id, arr);
  }
  return {
    matches: rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      students: studentsByHouse.get(r.id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// get_unbilled_summary
// ---------------------------------------------------------------------------

export async function handleGetUnbilledSummary(
  ctx: ToolCallerContext,
  input: GetUnbilledSummaryInput,
): Promise<ReadResult> {
  const { client, membership } = ctx;
  let start: Date, end: Date;
  if (input.period === 'custom') {
    if (!input.from || !input.to) return { error: 'from and to dates required for custom period.' };
    start = new Date(`${input.from}T00:00:00`);
    end = new Date(`${input.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
  } else {
    const p = periodPreset(input.period);
    start = p.start; end = p.end;
  }

  const tutorUserId = membership.role === 'tutor' ? membership.user_id : null;
  const sessions = await getUnbilledSessions(client, {
    organizationId: membership.organization_id,
    periodStart: start,
    periodEnd: end,
    tutorUserId,
  });
  const groups = await groupSessionsByHousehold(client, sessions);
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    totals: {
      households: groups.filter((g) => !g.is_ungrouped).length,
      sessions: groups.reduce((a, g) => a + g.session_count, 0),
      total_cents: groups.reduce((a, g) => a + g.total_cents, 0),
    },
    households: groups.map((g) => ({
      household_id: g.household_id,
      display_name: g.household_display_name,
      is_ungrouped: g.is_ungrouped,
      session_count: g.session_count,
      total_cents: g.total_cents,
      students: g.students.map((s) => ({
        student_name: s.student_name,
        session_count: s.session_count,
        subtotal_cents: s.subtotal_cents,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snippet(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}
