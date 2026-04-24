import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../../lib/membership';
import { resolveParentRowForUser } from '../../../../../lib/messaging';

// GET /api/messages/threads/[id]
// Returns thread info + messages (most recent 50 by default, with `before`
// cursor for older). Bumps the viewer's last_read_at.
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
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const threadId = req.query.id as string;
  const beforeCursor = typeof req.query.before === 'string' ? req.query.before : null;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const membership = await getMembershipForUser(userClient, userId);
  const parentRow = await resolveParentRowForUser(admin, userId);
  const viewer: 'tutor' | 'parent' = membership ? 'tutor' : parentRow ? 'parent' : 'tutor';

  // Fetch thread through user client — RLS scopes access to tutor/owner/parent.
  const { data: thread, error: threadErr } = await userClient
    .from('message_threads')
    .select('id, organization_id, student_id, parent_id, tutor_user_id, last_message_at, last_message_preview, tutor_last_read_at, parent_last_read_at, archived_at, student:students!inner(id, name), parent:parents!inner(id, name, email)')
    .eq('id', threadId)
    .maybeSingle();
  if (threadErr || !thread) return res.status(404).json({ error: 'Thread not found.' });

  // Messages (also RLS-scoped via messages_select_via_thread).
  let mq = userClient
    .from('messages')
    .select('id, sender_type, sender_user_id, body, urgency, created_at, edited_at, deleted_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeCursor) mq = mq.lt('created_at', beforeCursor);
  const { data: msgs } = await mq;
  const messages = (msgs ?? []).map((m: any) => ({
    id: m.id,
    sender_type: m.sender_type,
    sender_user_id: m.sender_user_id,
    body: m.deleted_at ? 'This message was deleted' : m.body,
    deleted: !!m.deleted_at,
    urgency: m.urgency,
    created_at: m.created_at,
    edited_at: m.edited_at,
  })).reverse(); // caller expects oldest→newest

  // Resolve sender names (tutor + parent).
  const { data: tutorProfile } = await admin
    .from('profiles').select('owner_name, email').eq('id', thread.tutor_user_id).maybeSingle();

  // Bump last_read_at for the viewer. Fire-and-forget.
  const readField = viewer === 'tutor' ? 'tutor_last_read_at' : 'parent_last_read_at';
  userClient
    .from('message_threads')
    .update({ [readField]: new Date().toISOString() })
    .eq('id', threadId)
    .then(() => undefined, () => undefined);

  return res.status(200).json({
    viewer,
    thread: {
      id: thread.id,
      student_id: thread.student_id,
      student_name: (thread as any).student?.name ?? 'Unknown',
      parent_id: thread.parent_id,
      parent_name: (thread as any).parent?.name ?? null,
      parent_email: (thread as any).parent?.email ?? null,
      tutor_user_id: thread.tutor_user_id,
      tutor_name: tutorProfile?.owner_name ?? null,
      last_message_at: thread.last_message_at,
      last_message_preview: thread.last_message_preview,
      archived: !!thread.archived_at,
    },
    messages,
    has_more: (msgs?.length ?? 0) >= limit,
    oldest_cursor: messages[0]?.created_at ?? null,
  });
}
