import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../../lib/membership';

// POST /api/messages/threads/[id]/archive
// Body: { archived: boolean }  (true archives, false unarchives)
// Tutor or owner only. Parents don't see archived state.
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
  if (!membership) return res.status(403).json({ error: 'Only tutors or owners can archive threads.' });

  const threadId = req.query.id as string;
  const archived = Boolean((req.body ?? {}).archived);

  const { data: thread } = await userClient
    .from('message_threads')
    .select('id, tutor_user_id, organization_id')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  // Only the assigned tutor or org owner can archive.
  const isOwner = membership.role === 'owner' && thread.organization_id === membership.organization_id;
  const isAssigned = thread.tutor_user_id === userId;
  if (!isOwner && !isAssigned) {
    return res.status(403).json({ error: 'Not your thread to archive.' });
  }

  const { error } = await userClient
    .from('message_threads')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', threadId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, archived });
}
