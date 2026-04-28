import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { writeAudit } from '../../../lib/audit';

// POST /api/student/homework-toggle
// Body: { session_id: string, homework_index: number, completed: boolean }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: studentUser } = await admin
    .from('student_users')
    .select('id, student_id, disabled_at')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!studentUser || studentUser.disabled_at) return res.status(404).json({ error: 'Not found.' });

  const body = (req.body ?? {}) as { session_id?: string; homework_index?: number; completed?: boolean };
  if (!body.session_id || typeof body.homework_index !== 'number') {
    return res.status(400).json({ error: 'session_id and homework_index required.' });
  }

  // Verify the session belongs to this student.
  const { data: sess } = await admin
    .from('sessions')
    .select('id, student_id, organization_id')
    .eq('id', body.session_id)
    .maybeSingle();
  if (!sess || sess.student_id !== studentUser.student_id) return res.status(403).json({ error: 'Forbidden.' });

  if (body.completed) {
    await admin.from('student_homework_completion').upsert({
      organization_id: sess.organization_id,
      session_id: body.session_id,
      student_user_id: studentUser.id,
      homework_index: body.homework_index,
    }, { onConflict: 'session_id,student_user_id,homework_index' });
  } else {
    await admin.from('student_homework_completion')
      .delete()
      .eq('session_id', body.session_id)
      .eq('student_user_id', studentUser.id)
      .eq('homework_index', body.homework_index);
  }

  await writeAudit(admin, {
    organizationId: sess.organization_id,
    actorUserId: userData.user.id,
    actorRole: 'student',
    action: body.completed ? 'student.homework_completed' : 'student.homework_uncompleted',
    entityType: 'session',
    entityId: body.session_id,
    payload: { student_user_id: studentUser.id, homework_index: body.homework_index },
  });

  return res.status(200).json({ ok: true });
}
