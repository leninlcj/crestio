import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../../lib/membership';

// POST /api/sessions/[id]/homework/mark-complete
// Tutor or org owner marks a session's homework as done.
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
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const sessionId = req.query.id as string;
  if (!sessionId) return res.status(400).json({ error: 'session id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: session } = await admin
    .from('sessions')
    .select('id, organization_id, tutor_user_id, homework_description, homework, homework_completed_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  if (membership.role === 'tutor' && session.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only mark homework on your own sessions.' });
  }

  const homeworkText = ((session as any).homework_description || (session as any).homework || '').trim();
  if (!homeworkText) {
    return res.status(400).json({ error: 'This session has no homework to mark.' });
  }

  if (session.homework_completed_at) {
    return res.status(200).json({
      ok: true,
      completedAt: session.homework_completed_at,
      already: true,
    });
  }

  const completedAt = new Date().toISOString();
  const { error: markErr } = await admin
    .from('sessions')
    .update({
      homework_completed_at: completedAt,
      homework_completed_by_user_id: userId,
    })
    .eq('id', sessionId);
  if (markErr) return res.status(500).json({ error: markErr.message });

  return res.status(200).json({ ok: true, completedAt });
}
