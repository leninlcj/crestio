import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAudit } from '../../lib/audit';
import { isValidEntityType } from '../../lib/entitySchema';

// POST   /api/pin     { entity_type, entity_id }   — pin (per-user)
// DELETE /api/pin     { entity_type, entity_id }   — unpin
// GET    /api/pin     ?entity_type=<type>          — list current user's pins

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await client.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(client, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  if (req.method === 'GET') {
    const entityType = req.query.entity_type as string | undefined;
    let q = client
      .from('pinned_items')
      .select('id, entity_type, entity_id, pinned_at, pin_order')
      .eq('user_id', userId)
      .order('pin_order', { ascending: true })
      .order('pinned_at', { ascending: false });
    if (entityType) q = q.eq('entity_type', entityType);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ pins: data ?? [] });
  }

  const body = (req.body ?? {}) as { entity_type?: string; entity_id?: string };
  if (!body.entity_type || !isValidEntityType(body.entity_type) || !body.entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id required.' });
  }

  if (req.method === 'POST') {
    const { error } = await client
      .from('pinned_items')
      .upsert({
        organization_id: membership.organization_id,
        user_id: userId,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
      }, { onConflict: 'user_id,entity_type,entity_id' });
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: 'pin.created',
      entityType: body.entity_type,
      entityId: body.entity_id,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await client
      .from('pinned_items')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', body.entity_type)
      .eq('entity_id', body.entity_id);
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: 'pin.removed',
      entityType: body.entity_type,
      entityId: body.entity_id,
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
