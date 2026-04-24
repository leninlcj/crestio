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

  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required.' });
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

  // Verify parent identity + active link to this student.
  const { data: parent } = await admin
    .from('parents')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single();
  if (!parent) {
    return res.status(403).json({ error: 'No parent account linked to this user.' });
  }

  const { data: link } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', parent.id)
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .single();
  if (!link) {
    return res.status(403).json({ error: 'You do not have access to this student.' });
  }

  // Fetch sessions using service role — selecting only parent-safe columns.
  // notes_internal is deliberately excluded.
  const { data: student } = await admin
    .from('students')
    .select('id, name, year_level, subjects')
    .eq('id', studentId)
    .single();

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, student_id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, proposed_change_by, proposed_new_start_time, proposed_new_duration_minutes, proposed_at, change_message, homework, homework_description, homework_due_date, homework_completed_at, homework_completed_by_user_id')
    .eq('student_id', studentId)
    .order('scheduled_at', { ascending: false });

  const { data: updates } = await admin
    .from('parent_updates')
    .select('id, content, created_at, created_by_user_id')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(25);

  // Resolve creator names for the small "From [tutor name]" line.
  const creatorIds = Array.from(new Set((updates ?? []).map((u: any) => u.created_by_user_id).filter(Boolean)));
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, owner_name')
      .in('id', creatorIds);
    for (const p of profiles ?? []) {
      if (p.owner_name) creatorNames.set(p.id, p.owner_name);
    }
    const missing = creatorIds.filter((id) => !creatorNames.has(id));
    if (missing.length > 0) {
      const { data: tutorRows } = await admin
        .from('tutors')
        .select('name, auth_user_id')
        .in('auth_user_id', missing);
      for (const t of tutorRows ?? []) {
        if (t.auth_user_id && t.name) creatorNames.set(t.auth_user_id, t.name);
      }
    }
  }

  const enrichedUpdates = (updates ?? []).map((u: any) => ({
    id: u.id,
    content: u.content,
    created_at: u.created_at,
    created_by_name: creatorNames.get(u.created_by_user_id) ?? 'Your tutor',
  }));

  return res.status(200).json({
    student: student ?? null,
    sessions: sessions ?? [],
    parent_updates: enrichedUpdates,
  });
}
