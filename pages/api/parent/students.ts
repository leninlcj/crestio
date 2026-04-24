import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await client.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const authUserId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents')
    .select('id, name, email')
    .eq('auth_user_id', authUserId)
    .single();
  if (!parent) {
    return res.status(403).json({ error: 'No parent account linked to this user.' });
  }

  const { data: links } = await admin
    .from('parent_student_links')
    .select('id, student_id')
    .eq('parent_id', parent.id)
    .is('revoked_at', null);

  const studentIds = (links ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) {
    return res.status(200).json({
      parent: { id: parent.id, name: parent.name, email: parent.email },
      students: [],
    });
  }

  const { data: students } = await admin
    .from('students')
    .select('id, name, year_level, subjects')
    .in('id', studentIds);

  // Next scheduled session per student, within the next 14 days.
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcoming } = await admin
    .from('sessions')
    .select('id, student_id, scheduled_at, duration_minutes, subject, topic')
    .in('student_id', studentIds)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', horizonIso)
    .order('scheduled_at', { ascending: true });

  const nextByStudent = new Map<string, any>();
  for (const s of upcoming ?? []) {
    if (!nextByStudent.has(s.student_id)) {
      nextByStudent.set(s.student_id, s);
    }
  }

  return res.status(200).json({
    parent: { id: parent.id, name: parent.name, email: parent.email },
    students: (students ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      year_level: s.year_level,
      subjects: s.subjects,
      nextSession: nextByStudent.get(s.id) ?? null,
    })),
  });
}
