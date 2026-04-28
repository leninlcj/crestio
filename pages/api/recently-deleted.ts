import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';

// GET /api/recently-deleted
// Returns a tiny summary of items archived/deleted in the last 24h for the
// dashboard widget.  No pagination — capped to a small count.

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Read from audit_log — simpler than scanning every table.
  const { data: rows } = await admin
    .from('audit_log')
    .select('id, action, entity_type, entity_id, payload, created_at')
    .eq('organization_id', membership.organization_id)
    .eq('actor_user_id', userId)
    .gte('created_at', since)
    .or('action.like.%.archived,action.like.%.deleted')
    .order('created_at', { ascending: false })
    .limit(50);

  const items = (rows ?? []).filter((r: any) =>
    /\.(archived|deleted)$/.test(r.action) && r.action !== 'message.deleted'
  );

  return res.status(200).json({
    count: items.length,
    items: items.slice(0, 10).map((r: any) => ({
      id: r.id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      label: r.payload?.entity_name ?? null,
      at: r.created_at,
    })),
  });
}
