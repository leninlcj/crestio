import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

// POST   /api/tags/attach  Body: { tag_id, entity_type, entity_id }
// DELETE /api/tags/attach  Body: { tag_id, entity_type, entity_id }

const ENTITY_TYPES = new Set(['student','parent','tutor','session','file','invoice','lesson_plan','household']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const body = (req.body ?? {}) as { tag_id?: string; entity_type?: string; entity_id?: string };
  if (!body.tag_id || !body.entity_type || !body.entity_id) {
    return res.status(400).json({ error: 'tag_id, entity_type, entity_id required.' });
  }
  if (!ENTITY_TYPES.has(body.entity_type)) {
    return res.status(400).json({ error: 'Invalid entity_type.' });
  }

  if (req.method === 'POST') {
    const { error } = await client.from('entity_tags').insert({
      organization_id: membership.organization_id,
      tag_id: body.tag_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      created_by: userData.user.id,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return res.status(200).json({ ok: true, existed: true });
      return res.status(500).json({ error: error.message });
    }

    await writeAudit(client, {
      organizationId: membership.organization_id,
      actorUserId: userData.user.id,
      actorRole: membership.role,
      action: 'tag.attached',
      entityType: body.entity_type,
      entityId: body.entity_id,
      payload: { tag_id: body.tag_id },
    });
    return res.status(200).json({ ok: true });
  }

  // DELETE
  const { error } = await client
    .from('entity_tags')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('tag_id', body.tag_id)
    .eq('entity_type', body.entity_type)
    .eq('entity_id', body.entity_id);
  if (error) return res.status(500).json({ error: error.message });

  await writeAudit(client, {
    organizationId: membership.organization_id,
    actorUserId: userData.user.id,
    actorRole: membership.role,
    action: 'tag.detached',
    entityType: body.entity_type,
    entityId: body.entity_id,
    payload: { tag_id: body.tag_id },
  });

  return res.status(200).json({ ok: true });
}
