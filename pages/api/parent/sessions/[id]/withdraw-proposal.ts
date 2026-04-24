import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// POST /api/parent/sessions/[id]/withdraw-proposal
// The parent decides they no longer want the change. Reverts the session
// to 'scheduled' and clears the proposal fields.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const parentAuthId = userData.user.id;

  const sessionId = req.query.id as string;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: session } = await admin
    .from('sessions')
    .select('id, status, proposed_by_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.proposed_by_user_id !== parentAuthId) {
    return res.status(403).json({ error: 'Only the parent who proposed the change can withdraw it.' });
  }
  if (session.status !== 'pending_change') {
    return res.status(400).json({ error: 'No pending change to withdraw.' });
  }

  const { error } = await admin.from('sessions').update({
    status: 'scheduled',
    proposed_change_by: null,
    proposed_new_start_time: null,
    proposed_new_duration_minutes: null,
    proposed_by_user_id: null,
    proposed_at: null,
    change_message: null,
  }).eq('id', sessionId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
