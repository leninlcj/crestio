import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// GET /api/households/[id] — household details with parents, students, sessions, invoices
// PATCH /api/households/[id] — update display_name, billing_email, notes, archived_at
// DELETE /api/households/[id] — soft-archive (sets archived_at)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: household } = await admin
    .from('households')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!household) return res.status(404).json({ error: 'Household not found.' });

  if (req.method === 'GET') {
    const [parentsRes, studentsRes, sessionsRes, invoicesRes] = await Promise.all([
      admin
        .from('household_parents')
        .select('id, is_primary, added_at, parent:parents!inner(id, name, email, auth_user_id)')
        .eq('household_id', id),
      admin
        .from('students')
        .select('id, name, year_level, subjects, archived, hourly_rate_cents')
        .eq('household_id', id)
        .eq('archived', false)
        .order('name'),
      // Sessions across all students in this household (recent first, capped).
      admin
        .from('sessions')
        .select('id, student_id, scheduled_at, duration_minutes, subject, topic, status, charge_rate_cents, paid, student:students!inner(name, household_id)')
        .eq('student.household_id', id)
        .order('scheduled_at', { ascending: false })
        .limit(50),
      admin
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, student_id, household_id, student:students(name)')
        .or(`household_id.eq.${id}`)
        .order('issued_on', { ascending: false })
        .limit(50),
    ]);

    // Also need per-student invoices for students in this household (since
    // historical invoices before 13H have household_id = NULL).
    const studentIds = (studentsRes.data ?? []).map((s: any) => s.id);
    let perStudentInvoices: any[] = [];
    if (studentIds.length > 0) {
      const { data } = await admin
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, student_id, household_id, student:students(name)')
        .in('student_id', studentIds)
        .is('household_id', null)
        .order('issued_on', { ascending: false })
        .limit(50);
      perStudentInvoices = data ?? [];
    }

    const mergedInvoices = [...(invoicesRes.data ?? []), ...perStudentInvoices];
    mergedInvoices.sort((a, b) => new Date(b.issued_on).getTime() - new Date(a.issued_on).getTime());

    const parents = ((parentsRes.data ?? []) as any[]).map((row) => ({
      membership_id: row.id,
      parent_id: row.parent?.id,
      name: row.parent?.name ?? null,
      email: row.parent?.email ?? null,
      auth_user_id: row.parent?.auth_user_id ?? null,
      is_primary: !!row.is_primary,
      added_at: row.added_at,
    }));

    return res.status(200).json({
      household,
      parents,
      students: studentsRes.data ?? [],
      sessions: sessionsRes.data ?? [],
      invoices: mergedInvoices,
    });
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === 'string') {
      const v = body.display_name.trim();
      if (!v) return res.status(400).json({ error: 'display_name cannot be empty.' });
      update.display_name = v;
    }
    if ('billing_email' in body) {
      const v = typeof body.billing_email === 'string' ? body.billing_email.trim() : '';
      update.billing_email = v || null;
    }
    if ('notes' in body) {
      const v = typeof body.notes === 'string' ? body.notes : '';
      update.notes = v.trim() || null;
    }
    if ('archived' in body) {
      update.archived_at = body.archived === true ? new Date().toISOString() : null;
    }
    const { data, error } = await admin
      .from('households').update(update).eq('id', id).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ household: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('households')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
