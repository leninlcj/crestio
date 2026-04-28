import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/student/sessions — student's own sessions only.
// Tutor's role is checked server-side; if the caller is not a student_user
// we 404 (don't leak that the route exists).

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  if (!studentUser || studentUser.disabled_at) {
    return res.status(404).json({ error: 'Not found.' });
  }

  // Update last_login_at on first request of the day (cheap and good enough).
  const now = new Date();
  await admin.from('student_users').update({ last_login_at: now.toISOString() }).eq('id', studentUser.id);

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, homework_description, parent_notified_at')
    .eq('student_id', studentUser.student_id)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: false })
    .limit(200);

  // Filter out internal-only fields: notes_internal, charge_rate_cents, etc are
  // already not selected — defense-in-depth via column allowlist above.

  const { data: completions } = await admin
    .from('student_homework_completion')
    .select('session_id, homework_index, completed_at')
    .eq('student_user_id', studentUser.id);

  const completedMap: Record<string, Set<number>> = {};
  for (const c of (completions ?? []) as any[]) {
    const set = completedMap[c.session_id] ?? new Set<number>();
    set.add(c.homework_index);
    completedMap[c.session_id] = set;
  }

  return res.status(200).json({
    sessions: (sessions ?? []).map((s: any) => ({
      ...s,
      hasNote: !!(s.notes_parent_facing && s.parent_notified_at),
      homework: parseHomework(s.homework_description, completedMap[s.id] ?? new Set()),
    })),
  });
}

function parseHomework(raw: string | null, completed: Set<number>): Array<{ index: number; text: string; done: boolean }> {
  if (!raw || !raw.trim()) return [];
  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
  return lines.map((text, index) => ({ index, text, done: completed.has(index) }));
}
