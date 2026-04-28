import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';

// GET /api/audit-log
// Query: ?actor=<user_id>&entity_type=<type>&entity_id=<uuid>
//        &action=<action>&from=<iso>&to=<iso>&limit=<n>&cursor=<iso>
//
// Owners see every row in their org.  Tutors see only their own actions.
// RLS enforces this; we simply pass the user's token through.

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const limit = Math.min(200, parseInt(req.query.limit as string, 10) || 50);
  let q = userClient
    .from('audit_log')
    .select('id, actor_user_id, actor_role, action, entity_type, entity_id, payload, created_at')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  const actor = req.query.actor as string | undefined;
  const entityType = req.query.entity_type as string | undefined;
  const entityId = req.query.entity_id as string | undefined;
  const action = req.query.action as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  if (actor) q = q.eq('actor_user_id', actor);
  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId) q = q.eq('entity_id', entityId);
  if (action) q = q.ilike('action', `%${action}%`);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean))) as string[];
  let actorMap: Record<string, { name: string | null; email: string | null }> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await userClient
      .from('profiles')
      .select('id, owner_name, email')
      .in('id', actorIds);
    actorMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, { name: p.owner_name ?? null, email: p.email ?? null }]),
    );
  }

  return res.status(200).json({
    rows: (data ?? []).map((r) => ({
      ...r,
      actor: r.actor_user_id ? actorMap[r.actor_user_id] ?? null : null,
    })),
    next_cursor: data && data.length === limit ? data[data.length - 1]!.created_at : null,
  });
}
