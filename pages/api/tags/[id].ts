import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

// PATCH  /api/tags/[id]  Body: { name?, color? }
// DELETE /api/tags/[id]
// GET    /api/tags/[id]/entities — list entity ids tagged

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const id = req.query.id as string | undefined;
  if (!id) return res.status(400).json({ error: 'tag id required.' });

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as { name?: string; color?: string };
    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string') update.name = body.name.trim().slice(0, 40);
    if (typeof body.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color)) update.color = body.color;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    const { error } = await client
      .from('tags').update(update)
      .eq('id', id).eq('organization_id', membership.organization_id);
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: membership.role,
      action: 'tag.updated', entityType: 'tag', entityId: id, payload: update,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await client
      .from('tags').delete()
      .eq('id', id).eq('organization_id', membership.organization_id);
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: membership.role,
      action: 'tag.deleted', entityType: 'tag', entityId: id,
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
