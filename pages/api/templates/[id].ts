import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

const KINDS = new Set(['message', 'note', 'invoice']);

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
  if (!id) return res.status(400).json({ error: 'id required.' });

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string') { update.name = body.name; update.title = body.name; }
    if (typeof body.body === 'string') { update.body_text = body.body; update.body = { text: body.body }; }
    if (Array.isArray(body.variables)) update.variables = body.variables;
    if (typeof body.kind === 'string' && KINDS.has(body.kind)) { update.kind = body.kind; update.type = body.kind; }
    if (typeof body.is_default === 'boolean') {
      if (body.is_default) {
        const { data: t } = await client
          .from('templates').select('kind').eq('id', id).maybeSingle();
        if (t?.kind) {
          await client
            .from('templates').update({ is_default: false })
            .eq('organization_id', membership.organization_id).eq('kind', t.kind);
        }
      }
      update.is_default = body.is_default;
    }
    update.updated_at = new Date().toISOString();
    const { error } = await client
      .from('templates').update(update)
      .eq('id', id).eq('organization_id', membership.organization_id);
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: membership.role,
      action: 'template.updated', entityType: 'template', entityId: id,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    // Soft-load name for audit + undo.
    const { data: existing } = await client
      .from('templates').select('id, name, title, kind, body, body_text, variables, is_default')
      .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
    const { error } = await client
      .from('templates').delete()
      .eq('id', id).eq('organization_id', membership.organization_id);
    if (error) return res.status(500).json({ error: error.message });
    await writeAudit(client, {
      organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: membership.role,
      action: 'template.deleted', entityType: 'template', entityId: id,
      payload: { entity_name: existing?.name ?? existing?.title, kind: existing?.kind },
    });
    return res.status(200).json({ ok: true, snapshot: existing });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
