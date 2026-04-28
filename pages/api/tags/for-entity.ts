import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// GET /api/tags/for-entity?entity_type=...&entity_id=...
// Returns the tag rows attached to a single entity.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await client.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(client, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No org membership.' });

  const entityType = req.query.entity_type as string | undefined;
  const entityId = req.query.entity_id as string | undefined;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entity_type, entity_id required.' });

  const { data, error } = await client
    .from('entity_tags')
    .select('tag:tags(id, name, color)')
    .eq('organization_id', membership.organization_id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ tags: (data ?? []).map((r: any) => r.tag).filter(Boolean) });
}
