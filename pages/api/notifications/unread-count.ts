import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/notifications/unread-count
// Lightweight poll for the bell badge.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(200).json({ total: 0, has_urgent: false });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(200).json({ total: 0, has_urgent: false });

  const { data: unread } = await userClient
    .from('notifications')
    .select('type')
    .is('read_at', null)
    .is('dismissed_at', null);
  const rows = (unread ?? []) as Array<{ type: string }>;
  const urgentTypes = new Set(['message_urgent', 'payment_failed', 'invoice_overdue']);
  return res.status(200).json({
    total: rows.length,
    has_urgent: rows.some((r) => urgentTypes.has(r.type)),
  });
}
