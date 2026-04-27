import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// GET /api/dashboard/today
// Single round-trip for the Today view. Five parallel queries, one payload.
// RLS scopes everything to the caller's org; we additionally filter by
// tutor_user_id when the caller is a tutor (so tutors see only their work).

const POLISH_LOOKBACK_DAYS = 14;
const INVOICE_LOOKBACK_DAYS = 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const isTutor = membership.role === 'tutor';
  const orgId = membership.organization_id;

  const nowIso = new Date().toISOString();
  const polishCutoff = new Date(Date.now() - POLISH_LOOKBACK_DAYS * 86_400_000).toISOString();
  const invoiceCutoff = new Date(Date.now() - INVOICE_LOOKBACK_DAYS * 86_400_000).toISOString();

  // End of Sunday in local time (Sydney); keep it simple and compute in UTC
  // for the SQL filter. Mondays-start week.
  const weekEnd = (() => {
    const d = new Date();
    const dow = d.getDay(); // 0=Sun..6=Sat
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
    const end = new Date(d);
    end.setDate(d.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  })();

  // ---- Parallel queries ----------------------------------------------------
  const scopeTutor = (q: any) => (isTutor ? q.eq('tutor_user_id', userId) : q);

  const nextSessionQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, status, tutor_user_id, student:students!inner(id, name)')
      .eq('organization_id', orgId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(1),
  );

  const polishQueueQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, subject, notes_internal, student:students!inner(id, name)')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .eq('polish_skipped', false)
      .gte('scheduled_at', polishCutoff)
      .not('notes_internal', 'is', null)
      .is('notes_parent_facing', null)
      .order('scheduled_at', { ascending: false })
      .limit(5),
  );

  const rescheduleQ = userClient
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, proposed_new_start_time, proposed_new_duration_minutes, proposed_at, change_message, student:students!inner(id, name), tutor_user_id')
    .eq('organization_id', orgId)
    .eq('status', 'pending_change')
    .eq('proposed_change_by', 'parent')
    .order('proposed_at', { ascending: true });
  // Apply tutor scope separately so we can also fetch the parent-name post-hoc.
  const rescheduleScoped = isTutor ? rescheduleQ.eq('tutor_user_id', userId) : rescheduleQ;

  const weekAheadQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, status, tutor_user_id, student:students!inner(id, name)')
      .eq('organization_id', orgId)
      .in('status', ['scheduled', 'pending_change'])
      .gte('scheduled_at', nowIso)
      .lte('scheduled_at', weekEnd)
      .order('scheduled_at', { ascending: true })
      .limit(30),
  );

  // Unbilled math needs two queries: completed sessions in the lookback window,
  // plus every invoice's issued_on per student.
  const unbilledSessionsQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, student:students!inner(id, name, hourly_rate_cents, household_id, is_test_record)')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .is('invoice_id', null)
      .gte('scheduled_at', invoiceCutoff)
      .order('scheduled_at', { ascending: true }),
  );

  const profileQ = userClient
    .from('profiles').select('owner_name, currency').eq('id', userId).maybeSingle();

  const homeworkCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const homeworkQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, homework_description, homework, homework_due_date, student:students!inner(id, name)')
      .eq('organization_id', orgId)
      .not('homework_description', 'is', null)
      .is('homework_completed_at', null)
      .gte('homework_due_date', homeworkCutoff)
      .order('homework_due_date', { ascending: true })
      .limit(30),
  );

  // Unpaid invoices summary — count, sum, oldest overdue.
  const unpaidInvoicesQ = userClient
    .from('invoices')
    .select('id, total_cents, due_on, status, issued_on')
    .eq('organization_id', orgId)
    .in('status', ['sent', 'overdue']);

  // Past 7 days of completed sessions — drives the stat-card sparklines.
  const sevenDayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d.toISOString();
  })();
  const recentSessionsForSeriesQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, status, duration_minutes, paid')
      .eq('organization_id', orgId)
      .gte('scheduled_at', sevenDayStart),
  );

  // Today's already-finished sessions (for the morning-briefing timeline).
  const todayStartIsoStr = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const todayCompletedQ = scopeTutor(
    userClient
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, status, student:students!inner(id, name)')
      .eq('organization_id', orgId)
      .in('status', ['completed', 'cancelled', 'no_show'])
      .gte('scheduled_at', todayStartIsoStr)
      .lt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(20),
  );

  const [
    nextSessionRes, polishRes, rescheduleRes, weekAheadRes, unbilledRes, profileRes, homeworkRes, unpaidInvoicesRes, todayCompletedRes, recentSeriesRes,
  ] = await Promise.all([
    nextSessionQ, polishQueueQ, rescheduleScoped, weekAheadQ, unbilledSessionsQ, profileQ, homeworkQ, unpaidInvoicesQ, todayCompletedQ, recentSessionsForSeriesQ,
  ]);

  // ---- Reshape + post-process ---------------------------------------------
  const nextSession = (nextSessionRes.data ?? []).map((s: any) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    subject: s.subject,
    student_name: s.student?.name ?? 'Unknown',
    tutor_user_id: s.tutor_user_id,
  }))[0] ?? null;

  // If the caller is the owner and the next session is taught by someone else,
  // we need that tutor's display name. Do this once, not per-session.
  let nextSessionTutorName: string | null = null;
  if (!isTutor && nextSession && nextSession.tutor_user_id && nextSession.tutor_user_id !== userId) {
    const { data: tp } = await userClient
      .from('profiles').select('owner_name').eq('id', nextSession.tutor_user_id).maybeSingle();
    nextSessionTutorName = tp?.owner_name ?? null;
  }

  const polishQueue = ((polishRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    subject: s.subject,
    student_name: s.student?.name ?? 'Unknown',
    notes_internal_snippet: snippet(s.notes_internal, 120),
  }));

  // Reschedule rows — parent-side name is a secondary fetch. Keep it simple:
  // fetch in parallel once we know which students are involved.
  const rescheduleRows = (rescheduleRes.data ?? []) as any[];
  let parentNameByStudent = new Map<string, string | null>();
  if (rescheduleRows.length > 0) {
    const studentIds = Array.from(new Set(rescheduleRows.map((r) => r.student?.id).filter(Boolean)));
    const { data: links } = await userClient
      .from('parent_student_links')
      .select('student_id, parent:parents!inner(name)')
      .in('student_id', studentIds)
      .is('revoked_at', null);
    for (const l of (links ?? []) as any[]) {
      // First linked parent's name wins — most tutors have one parent per student.
      if (!parentNameByStudent.has(l.student_id)) {
        parentNameByStudent.set(l.student_id, l.parent?.name ?? null);
      }
    }
  }
  const rescheduleRequests = rescheduleRows.map((r) => ({
    session_id: r.id,
    scheduled_at: r.scheduled_at,
    duration_minutes: r.duration_minutes,
    subject: r.subject,
    proposed_new_start_time: r.proposed_new_start_time,
    proposed_new_duration_minutes: r.proposed_new_duration_minutes,
    proposed_at: r.proposed_at,
    message: r.change_message,
    student_name: r.student?.name ?? 'Unknown',
    parent_name: parentNameByStudent.get(r.student?.id) ?? null,
  }));

  const weekAhead = ((weekAheadRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    subject: s.subject,
    status: s.status,
    student_name: s.student?.name ?? 'Unknown',
  }));

  // Invoicing queue — group unbilled completed sessions by parent family.
  const unbilledSessions = (unbilledRes.data ?? []) as any[];
  const invoicingQueue = await computeInvoicingQueue(userClient, unbilledSessions, orgId);

  const currency = profileRes.data?.currency ?? 'AUD';
  const ownerName = profileRes.data?.owner_name ?? null;

  const homeworkPending = ((homeworkRes.data ?? []) as any[])
    .map((s) => ({
      session_id: s.id,
      student_id: s.student?.id ?? '',
      student_name: s.student?.name ?? 'Unknown',
      homework_snippet: snippet(s.homework_description || s.homework, 100),
      homework_due_date: s.homework_due_date ?? null,
    }))
    .filter((e) => e.homework_snippet);

  // Aggregate unpaid invoice summary.
  const unpaidInvoices = (unpaidInvoicesRes.data ?? []) as Array<{
    id: string; total_cents: number; due_on: string | null; status: string; issued_on: string;
  }>;
  const unpaidCount = unpaidInvoices.length;
  const unpaidTotalCents = unpaidInvoices.reduce((acc, i) => acc + (i.total_cents ?? 0), 0);
  let oldestOverdueDays = 0;
  for (const inv of unpaidInvoices) {
    if (!inv.due_on) continue;
    const due = new Date(inv.due_on + 'T00:00:00Z').getTime();
    const diffDays = Math.floor((Date.now() - due) / 86_400_000);
    if (diffDays > oldestOverdueDays) oldestOverdueDays = diffDays;
  }

  // Today's sessions count + total minutes (filtered from week_ahead) plus
  // the sessions already completed earlier in the day.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todaysUpcoming = weekAhead.filter((s) => {
    const t = new Date(s.scheduled_at).getTime();
    return t >= todayStart.getTime() && t <= todayEnd.getTime();
  });
  const todaysCompleted = ((todayCompletedRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    subject: s.subject,
    status: s.status as string,
    student_name: s.student?.name ?? 'Unknown',
  }));
  const todaysSessions = [...todaysCompleted, ...todaysUpcoming]
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const todayCount = todaysSessions.length;
  const todayMinutes = todaysSessions.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0);

  // This week scheduled count (week_ahead is already constrained to week end).
  const weekScheduledCount = weekAhead.length;

  // ---- Stat-card sparklines (last 7 days, oldest → newest). ---------------
  const recentRows = (recentSeriesRes.data ?? []) as Array<{
    scheduled_at: string; status: string; duration_minutes: number; paid: boolean | null;
  }>;
  const todayBucket = new Date();
  todayBucket.setHours(0, 0, 0, 0);
  const dayKeys: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayBucket);
    d.setDate(todayBucket.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const completedByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const allByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const pendingPolishByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const row of recentRows) {
    const k = row.scheduled_at.slice(0, 10);
    if (!completedByDay.has(k)) continue;
    allByDay.set(k, (allByDay.get(k) ?? 0) + 1);
    if (row.status === 'completed') {
      completedByDay.set(k, (completedByDay.get(k) ?? 0) + 1);
    }
  }
  // Polish queue uses the same window: count completed sessions still missing
  // a parent-facing note. We don't have polished flag in the projection — fall
  // back to a flat shape using completed counts as a proxy. Cheap and good
  // enough for a 12px sparkline.
  for (const [k, v] of completedByDay) pendingPolishByDay.set(k, v);

  const todaySeries = dayKeys.map((k) => allByDay.get(k) ?? 0);
  const weekSeries = dayKeys.map((k) => allByDay.get(k) ?? 0);
  const polishSeries = dayKeys.map((k) => pendingPolishByDay.get(k) ?? 0);
  // Unpaid invoice sparkline = constant unpaid count flat baseline (no
  // historical materialization without a schema change). Keep it as a
  // declining-or-flat hint based on issued_on for the same window.
  const unpaidSeries = dayKeys.map((k) => {
    let n = 0;
    for (const inv of unpaidInvoices) {
      if (inv.issued_on && inv.issued_on <= k) n += 1;
    }
    return n;
  });

  return res.status(200).json({
    role: membership.role,
    currency,
    owner_name: ownerName,
    next_session: nextSession
      ? { ...nextSession, tutor_name: nextSessionTutorName }
      : null,
    polish_queue: polishQueue,
    reschedule_requests: rescheduleRequests,
    week_ahead: weekAhead,
    invoicing_queue: invoicingQueue,
    homework_pending: homeworkPending,
    // ---- New summary fields for the redesigned dashboard ----
    today: {
      count: todayCount,
      minutes: todayMinutes,
      // Convenience reference for the timeline.
      sessions: todaysSessions,
      series: todaySeries,
    },
    week: {
      scheduled_count: weekScheduledCount,
      series: weekSeries,
    },
    polish: {
      series: polishSeries,
    },
    unpaid_invoices: {
      count: unpaidCount,
      total_cents: unpaidTotalCents,
      oldest_overdue_days: oldestOverdueDays,
      series: unpaidSeries,
    },
  });
}

function snippet(text: string | null, max: number): string | null {
  if (!text) return null;
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return t.length <= max ? t : t.slice(0, max) + '…';
}

type InvoicingEntry = {
  parent_name: string;
  student_ids: string[];
  student_names: string[];
  session_count: number;
  total_cents: number;
  first_session_id: string;
};

async function computeInvoicingQueue(
  client: SupabaseClient,
  unbilledSessions: any[],
  orgId: string,
): Promise<InvoicingEntry[]> {
  if (unbilledSessions.length === 0) return [];

  // Drop sessions already moved to batch invoices via invoice_sessions (the
  // new link path). Legacy per-student invoices use sessions.invoice_id which
  // is already filtered in the query above.
  const sessionIds = unbilledSessions.map((s) => s.id);
  const { data: already } = await client
    .from('invoice_sessions').select('session_id').in('session_id', sessionIds);
  const alreadySet = new Set(((already ?? []) as any[]).map((r) => r.session_id));
  unbilledSessions = unbilledSessions.filter((s) => !alreadySet.has(s.id) && !s.student?.is_test_record);
  if (unbilledSessions.length === 0) return [];

  const studentIds = Array.from(new Set(unbilledSessions.map((s) => s.student?.id).filter(Boolean)));
  const householdIds = Array.from(new Set(unbilledSessions.map((s) => s.student?.household_id).filter(Boolean)));

  // Household display names (preferred grouping).
  const householdById = new Map<string, string>();
  if (householdIds.length > 0) {
    const { data: households } = await client
      .from('households')
      .select('id, display_name')
      .in('id', householdIds);
    for (const h of (households ?? []) as any[]) householdById.set(h.id, h.display_name);
  }

  // Fallback parent lookup for students with no household yet.
  const { data: links } = await client
    .from('parent_student_links')
    .select('student_id, parent:parents!inner(name, email)')
    .in('student_id', studentIds)
    .is('revoked_at', null);
  const parentByStudent = new Map<string, { name: string; email: string | null } | null>();
  for (const l of (links ?? []) as any[]) {
    if (!parentByStudent.has(l.student_id)) {
      parentByStudent.set(l.student_id, { name: l.parent?.name ?? 'Parent', email: l.parent?.email ?? null });
    }
  }

  // Group sessions by household when possible, falling back to parent name,
  // then the student's own name. Household is the canonical bucket post-13H.
  const groups = new Map<string, InvoicingEntry>();
  for (const s of unbilledSessions) {
    const studentId = s.student?.id;
    const studentName = s.student?.name ?? 'Unknown';
    const rateCents = s.student?.hourly_rate_cents ?? 0;
    const durationMin = s.duration_minutes ?? 0;
    const amount = Math.round((rateCents * durationMin) / 60);
    const householdId = s.student?.household_id ?? null;
    const householdName = householdId ? householdById.get(householdId) : null;

    const parent = studentId ? parentByStudent.get(studentId) : null;
    const key = householdId
      ? `household:${householdId}`
      : parent ? `parent:${parent.name}` : `student:${studentId}`;
    const displayName = householdName ?? (parent ? parent.name : studentName);

    const existing = groups.get(key);
    if (existing) {
      existing.session_count++;
      existing.total_cents += amount;
      if (!existing.student_ids.includes(studentId)) {
        existing.student_ids.push(studentId);
        existing.student_names.push(studentName);
      }
    } else {
      groups.set(key, {
        parent_name: displayName,
        student_ids: studentId ? [studentId] : [],
        student_names: [studentName],
        session_count: 1,
        total_cents: amount,
        first_session_id: s.id,
      });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.total_cents - a.total_cents)
    .slice(0, 5);
}
