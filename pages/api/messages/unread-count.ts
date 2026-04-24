import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { resolveParentRowForUser } from '../../../lib/messaging';

// GET /api/messages/unread-count
// Returns { total, has_urgent } for the viewer across all their threads.
// Used by the sidebar badge and the mobile bottom-tab dot.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  if (authErr || !userData?.user) return res.status(200).json({ total: 0, has_urgent: false });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const membership = await getMembershipForUser(userClient, userId);
  const parentRow = await resolveParentRowForUser(admin, userId);
  const viewer: 'tutor' | 'parent' = membership ? 'tutor' : parentRow ? 'parent' : 'tutor';
  if (!membership && !parentRow) return res.status(200).json({ total: 0, has_urgent: false });

  const { data: threads } = await userClient
    .from('message_threads')
    .select('id, tutor_last_read_at, parent_last_read_at')
    .is('archived_at', null);
  const list = (threads ?? []) as any[];
  if (list.length === 0) return res.status(200).json({ total: 0, has_urgent: false });

  const { data: messages } = await admin
    .from('messages')
    .select('thread_id, sender_type, urgency, created_at, deleted_at')
    .in('thread_id', list.map((t) => t.id))
    .is('deleted_at', null);

  let total = 0;
  let hasUrgent = false;
  for (const t of list) {
    const lastRead = viewer === 'tutor' ? t.tutor_last_read_at : t.parent_last_read_at;
    const cutoff = lastRead ? new Date(lastRead).getTime() : 0;
    const unread = (messages ?? []).filter((m: any) =>
      m.thread_id === t.id
      && m.sender_type !== viewer
      && new Date(m.created_at).getTime() > cutoff,
    );
    total += unread.length;
    if (unread.some((m: any) => m.urgency === 'urgent')) hasUrgent = true;
  }

  return res.status(200).json({ total, has_urgent: hasUrgent });
}
