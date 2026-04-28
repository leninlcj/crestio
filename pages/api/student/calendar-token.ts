import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { newToken } from '../../../lib/studentAccess';

// POST /api/student/calendar-token
// Generates / rotates a calendar_token for the authenticated student and
// returns the public ICS URL.

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
    .from('student_users').select('student_id, disabled_at')
    .eq('auth_user_id', userData.user.id).maybeSingle();
  if (!studentUser || studentUser.disabled_at) return res.status(404).json({ error: 'Not found.' });

  const { data: access } = await admin
    .from('student_portal_access').select('id, calendar_token').eq('student_id', studentUser.student_id).maybeSingle();
  if (!access) return res.status(404).json({ error: 'Not found.' });

  let token = access.calendar_token;
  if (!token) {
    token = newToken();
    await admin.from('student_portal_access').update({ calendar_token: token, updated_at: new Date().toISOString() }).eq('id', access.id);
  }

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'crestio.ai';
  return res.status(200).json({
    ics_url: `${proto}://${host}/api/calendar/student.ics?token=${token}`,
  });
}
