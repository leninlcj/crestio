import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';

// GET /api/search?q=...
// Cross-table search for the global search modal. Returns up to 5 hits per
// category (students, sessions, invoices, lesson plans). Scoped to the
// caller's org by RLS.
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
  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQuery.length < 2) {
    return res.status(200).json({ students: [], sessions: [], invoices: [], lesson_plans: [] });
  }
  const like = `%${rawQuery}%`;

  const [studentsRes, sessionsRes, invoicesRes, plansRes] = await Promise.all([
    userClient
      .from('students')
      .select('id, name, year_level, subjects, archived')
      .or(`name.ilike.${like},parent_name.ilike.${like},parent_email.ilike.${like}`)
      .eq('archived', false)
      .limit(5),
    userClient
      .from('sessions')
      .select('id, scheduled_at, subject, topic, status, student:students!inner(id, name)')
      .or(`subject.ilike.${like},topic.ilike.${like}`)
      .order('scheduled_at', { ascending: false })
      .limit(5),
    userClient
      .from('invoices')
      .select('id, number, status, total_cents, issued_on, student:students!inner(id, name)')
      .ilike('number', like)
      .limit(5),
    userClient
      .from('lesson_plans')
      .select('id, subject, topic, year_level, created_at, student:students(id, name)')
      .or(`subject.ilike.${like},topic.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return res.status(200).json({
    students: (studentsRes.data ?? []).map((s: any) => ({
      id: s.id, name: s.name, year_level: s.year_level,
      subject: s.subjects && s.subjects.length > 0 ? s.subjects[0] : null,
    })),
    sessions: (sessionsRes.data ?? []).map((s: any) => ({
      id: s.id, scheduled_at: s.scheduled_at,
      subject: s.subject, topic: s.topic, status: s.status,
      student_id: s.student?.id, student_name: s.student?.name,
    })),
    invoices: (invoicesRes.data ?? []).map((i: any) => ({
      id: i.id, number: i.number, status: i.status, total_cents: i.total_cents, issued_on: i.issued_on,
      student_name: i.student?.name,
    })),
    lesson_plans: (plansRes.data ?? []).map((p: any) => ({
      id: p.id, subject: p.subject, topic: p.topic, year_level: p.year_level,
      student_name: p.student?.name ?? null,
    })),
  });
}
