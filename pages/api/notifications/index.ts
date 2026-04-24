import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/notifications
// Query: limit (default 30, max 100), before (cursor = ISO), type (filter)
// Returns: { notifications, unread_count, has_more }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30) || 30));
  const beforeCursor = typeof req.query.before === 'string' ? req.query.before : null;
  const typeFilter = typeof req.query.type === 'string' ? req.query.type : null;

  let q = userClient
    .from('notifications')
    .select('id, type, title, body, link_url, context, created_at, read_at, dismissed_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeCursor) q = q.lt('created_at', beforeCursor);
  if (typeFilter) q = q.eq('type', typeFilter);

  const { data: notifications, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const { count: unreadCount } = await userClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .is('dismissed_at', null);

  const rows = notifications ?? [];
  return res.status(200).json({
    notifications: rows,
    unread_count: unreadCount ?? 0,
    has_more: rows.length >= limit,
    oldest_cursor: rows[rows.length - 1]?.created_at ?? null,
  });
}
