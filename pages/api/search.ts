import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';

// GET /api/search?q=...
// Cross-table search for the Cmd+K palette and inline searches.  Returns
// up to 5 hits per category, ranked by trigram similarity (when available)
// then recency.  Scoped to the caller's org via RLS.
//
// Categories: students, parents, tutors, sessions, invoices, lesson_plans,
// files, tags.

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQuery.length < 2) {
    return res.status(200).json({
      students: [], parents: [], tutors: [], sessions: [], invoices: [],
      lesson_plans: [], files: [], tags: [],
    });
  }
  const like = `%${rawQuery}%`;
  const limit = 5;

  const [
    studentsRes, parentsRes, tutorsRes, sessionsRes,
    invoicesRes, plansRes, filesRes, tagsRes,
  ] = await Promise.all([
    userClient
      .from('students')
      .select('id, name, year_level, subjects')
      .or(`name.ilike.${like},parent_name.ilike.${like},parent_email.ilike.${like}`)
      .is('archived_at', null).eq('archived', false)
      .limit(limit),
    userClient
      .from('parents')
      .select('id, name, email')
      .or(`name.ilike.${like},email.ilike.${like}`)
      .is('archived_at', null)
      .limit(limit),
    userClient
      .from('tutors')
      .select('id, name, email')
      .or(`name.ilike.${like},email.ilike.${like}`)
      .is('archived_at', null)
      .limit(limit),
    userClient
      .from('sessions')
      .select('id, scheduled_at, subject, topic, status, student:students!inner(id, name)')
      .or(`subject.ilike.${like},topic.ilike.${like},notes_internal.ilike.${like},notes_parent_facing.ilike.${like}`)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: false })
      .limit(limit),
    userClient
      .from('invoices')
      .select('id, number, status, total_cents, issued_on, student:students!inner(id, name)')
      .or(`number.ilike.${like}`)
      .is('deleted_at', null)
      .limit(limit),
    userClient
      .from('lesson_plans')
      .select('id, subject, topic, year_level, created_at, student:students(id, name)')
      .or(`subject.ilike.${like},topic.ilike.${like},content.ilike.${like}`)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    userClient
      .from('files')
      .select('id, display_name, original_filename, mime_type, created_at')
      .or(`display_name.ilike.${like},original_filename.ilike.${like}`)
      .is('deleted_at', null).is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    userClient
      .from('tags').select('id, name, color')
      .ilike('name', like).limit(limit),
  ]);

  return res.status(200).json({
    students: (studentsRes.data ?? []).map((s: any) => ({
      id: s.id, name: s.name, year_level: s.year_level,
      subject: Array.isArray(s.subjects) && s.subjects.length > 0 ? s.subjects[0] : null,
    })),
    parents: (parentsRes.data ?? []).map((p: any) => ({ id: p.id, name: p.name, email: p.email })),
    tutors: (tutorsRes.data ?? []).map((t: any) => ({ id: t.id, name: t.name, email: t.email })),
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
    files: (filesRes.data ?? []).map((f: any) => ({
      id: f.id, name: f.display_name ?? f.original_filename, mime_type: f.mime_type,
      created_at: f.created_at,
    })),
    tags: (tagsRes.data ?? []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })),
  });
}
