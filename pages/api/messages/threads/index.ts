import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { resolveParentRowForUser } from '../../../../lib/messaging';

// GET /api/messages/threads
// Query: student_id?, has_unread?, archived? (default false), limit (default 50), offset (default 0)
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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const membership = await getMembershipForUser(userClient, userId);
  const parentRow = await resolveParentRowForUser(admin, userId);
  const viewer: 'tutor' | 'parent' = membership ? 'tutor' : parentRow ? 'parent' : 'tutor';
  if (!membership && !parentRow) return res.status(403).json({ error: 'No access.' });

  const studentFilter = typeof req.query.student_id === 'string' ? req.query.student_id : null;
  const hasUnreadFilter = req.query.has_unread === 'true';
  const archivedFilter = req.query.archived === 'true';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

  // Threads are returned through the user client so RLS does the scoping.
  let q = userClient
    .from('message_threads')
    .select('id, organization_id, student_id, parent_id, tutor_user_id, last_message_at, last_message_preview, tutor_last_read_at, parent_last_read_at, archived_at, student:students!inner(id, name), parent:parents!inner(id, name, email)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (studentFilter) q = q.eq('student_id', studentFilter);
  if (archivedFilter) q = q.not('archived_at', 'is', null);
  else q = q.is('archived_at', null);

  const { data: threads, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const list = (threads ?? []) as any[];
  if (list.length === 0) return res.status(200).json({ threads: [] });

  // Batch fetch tutor names + unread counts + urgent-unread flags.
  const tutorIds = Array.from(new Set(list.map((t) => t.tutor_user_id)));
  const { data: tutorProfiles } = await admin
    .from('profiles').select('id, owner_name').in('id', tutorIds);
  const tutorNameById = new Map<string, string | null>();
  for (const p of (tutorProfiles ?? []) as any[]) {
    tutorNameById.set(p.id, p.owner_name ?? null);
  }

  // Unread counts are viewer-dependent. We query messages per thread as a
  // single round-trip with a large `in` clause, then aggregate in JS.
  const threadIds = list.map((t) => t.id);
  const { data: recentMsgs } = await admin
    .from('messages')
    .select('thread_id, sender_type, urgency, created_at, deleted_at')
    .in('thread_id', threadIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  const byThread = new Map<string, Array<{ sender_type: 'tutor' | 'parent'; urgency: string | null; created_at: string }>>();
  for (const m of (recentMsgs ?? []) as any[]) {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
    byThread.get(m.thread_id)!.push(m);
  }

  const out = list
    .map((t) => {
      const viewerLastRead = viewer === 'tutor' ? t.tutor_last_read_at : t.parent_last_read_at;
      const cutoff = viewerLastRead ? new Date(viewerLastRead).getTime() : 0;
      const ms = byThread.get(t.id) ?? [];
      const unread = ms.filter((m) =>
        m.sender_type !== viewer && new Date(m.created_at).getTime() > cutoff
      );
      const hasUrgentUnread = unread.some((m) => m.urgency === 'urgent');

      return {
        id: t.id as string,
        student_id: t.student_id as string,
        student_name: t.student?.name ?? 'Unknown',
        parent_id: t.parent_id as string,
        parent_name: t.parent?.name ?? null,
        parent_email: t.parent?.email ?? null,
        tutor_user_id: t.tutor_user_id as string,
        tutor_name: tutorNameById.get(t.tutor_user_id) ?? null,
        last_message_at: t.last_message_at as string | null,
        last_message_preview: t.last_message_preview as string | null,
        archived: !!t.archived_at,
        unread_count: unread.length,
        has_urgent_unread: hasUrgentUnread,
      };
    })
    .filter((t) => (hasUnreadFilter ? t.unread_count > 0 : true));

  return res.status(200).json({ threads: out, viewer });
}
