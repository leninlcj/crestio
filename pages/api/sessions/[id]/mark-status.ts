import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// POST /api/sessions/[id]/mark-status
// Body: { status: 'completed' | 'no_show' }
// Only allowed for sessions in the past.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const sessionId = req.query.id as string;
  const body = (req.body ?? {}) as Record<string, any>;
  const nextStatus = String(body.status ?? '');
  if (nextStatus !== 'completed' && nextStatus !== 'no_show') {
    return res.status(400).json({ error: 'status must be completed or no_show.' });
  }

  const { data: session } = await userClient
    .from('sessions')
    .select('id, scheduled_at, status, tutor_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (membership.role === 'tutor' && session.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only mark your own sessions.' });
  }
  if (new Date(session.scheduled_at).getTime() > Date.now() + 60_000) {
    return res.status(400).json({ error: 'Cannot mark status on a future session.' });
  }

  const { error } = await userClient.from('sessions').update({ status: nextStatus }).eq('id', sessionId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
