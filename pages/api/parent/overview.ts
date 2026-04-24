import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/parent/overview
// Returns the parent's linked children + this-week's sessions + recent
// updates + quick stats in a single round-trip. Replaces the slow multi-
// query sequence on /parent/dashboard.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents').select('id, email, name').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'No parent account linked.' });

  // Step 1: active student links.
  const { data: links } = await admin
    .from('parent_student_links')
    .select('student_id, student:students!inner(id, name, year_level, subjects, organization_id, household_id)')
    .eq('parent_id', parent.id)
    .is('revoked_at', null);
  const studentIds = ((links ?? []) as any[]).map((l) => l.student_id);
  const students = ((links ?? []) as any[]).map((l) => ({
    id: l.student?.id,
    name: l.student?.name,
    year_level: l.student?.year_level,
    subjects: l.student?.subjects,
    organization_id: l.student?.organization_id,
    household_id: l.student?.household_id ?? null,
  }));

  // Resolve household display names for any linked students that have one.
  const householdIds = Array.from(new Set(students.map((s) => s.household_id).filter(Boolean))) as string[];
  const householdNames = new Map<string, string>();
  if (householdIds.length > 0) {
    const { data: hs } = await admin
      .from('households').select('id, display_name').in('id', householdIds);
    for (const h of (hs ?? []) as any[]) householdNames.set(h.id, h.display_name);
  }

  if (studentIds.length === 0) {
    return res.status(200).json({
      parent: { name: parent.name, email: parent.email },
      students: [],
      this_week_sessions: [],
      recent_updates: [],
      stats: { sessions_this_month: 0, sessions_this_year: 0, outstanding_cents: 0, paid_cents: 0 },
    });
  }

  // Step 2: parallel fetch sessions (this week + month totals + year totals),
  // parent_updates, and invoice aggregates.
  const now = new Date();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0);
  const wkDay = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (wkDay === 0 ? 6 : wkDay - 1));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [thisWeekRes, monthRes, yearRes, updatesRes, invoicesRes] = await Promise.all([
    admin
      .from('sessions')
      .select('id, student_id, subject, scheduled_at, duration_minutes, status, tutor_user_id, proposed_change_by, proposed_new_start_time, student:students!inner(id, name)')
      .in('student_id', studentIds)
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .in('student_id', studentIds)
      .eq('status', 'completed')
      .gte('scheduled_at', monthStart.toISOString()),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .in('student_id', studentIds)
      .eq('status', 'completed')
      .gte('scheduled_at', yearStart.toISOString()),
    admin
      .from('parent_updates')
      .select('id, student_id, content, created_at, created_by_user_id')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(3),
    admin
      .from('invoices')
      .select('total_cents, status, student_id')
      .in('student_id', studentIds),
  ]);

  // Look up tutor display names in one round-trip.
  const tutorIds = Array.from(new Set(((thisWeekRes.data ?? []) as any[]).map((s) => s.tutor_user_id).filter(Boolean)));
  const tutorNames = new Map<string, string>();
  if (tutorIds.length > 0) {
    const { data: tutorProfiles } = await admin
      .from('profiles').select('id, owner_name').in('id', tutorIds);
    for (const p of tutorProfiles ?? []) {
      if (p.owner_name) tutorNames.set(p.id, p.owner_name);
    }
  }

  const thisWeek = ((thisWeekRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    student_id: s.student_id,
    student_name: s.student?.name ?? 'Unknown',
    subject: s.subject,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    status: s.status,
    proposed_change_by: s.proposed_change_by,
    proposed_new_start_time: s.proposed_new_start_time,
    tutor_name: s.tutor_user_id ? tutorNames.get(s.tutor_user_id) ?? null : null,
  }));

  // Resolve creator names for parent_updates.
  const creatorIds = Array.from(new Set(((updatesRes.data ?? []) as any[]).map((u) => u.created_by_user_id))).filter(Boolean);
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles').select('id, owner_name').in('id', creatorIds);
    for (const p of profiles ?? []) if (p.owner_name) creatorNames.set(p.id, p.owner_name);
  }
  const recentUpdates = ((updatesRes.data ?? []) as any[]).map((u) => {
    const student = students.find((s) => s.id === u.student_id);
    return {
      id: u.id,
      student_id: u.student_id,
      student_name: student?.name ?? null,
      content: u.content,
      created_at: u.created_at,
      created_by_name: creatorNames.get(u.created_by_user_id) ?? 'Your tutor',
    };
  });

  const invoices = (invoicesRes.data ?? []) as Array<{ total_cents: number; status: string; student_id: string }>;
  let outstandingCents = 0;
  let paidCents = 0;
  const outstandingByStudent = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status === 'paid') paidCents += inv.total_cents ?? 0;
    else if (inv.status !== 'void') {
      outstandingCents += inv.total_cents ?? 0;
      outstandingByStudent.set(inv.student_id, (outstandingByStudent.get(inv.student_id) ?? 0) + (inv.total_cents ?? 0));
    }
  }

  return res.status(200).json({
    parent: { name: parent.name, email: parent.email },
    students: students.map((s) => ({
      ...s,
      household_name: s.household_id ? householdNames.get(s.household_id) ?? null : null,
      outstanding_cents: outstandingByStudent.get(s.id) ?? 0,
    })),
    this_week_sessions: thisWeek,
    recent_updates: recentUpdates,
    stats: {
      sessions_this_month: monthRes.count ?? 0,
      sessions_this_year: yearRes.count ?? 0,
      outstanding_cents: outstandingCents,
      paid_cents: paidCents,
    },
  });
}
