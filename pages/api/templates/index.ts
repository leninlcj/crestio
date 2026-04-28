import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

// GET  /api/templates?kind=message  — list templates filtered by kind
// POST /api/templates                — { kind, name, body, variables?, is_default? }

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

  if (req.method === 'GET') {
    const kind = req.query.kind as string | undefined;
    let q = client
      .from('templates')
      .select('id, kind, type, name, title, body, body_text, variables, is_default, usage_count, last_used_at, created_at, updated_at')
      .eq('organization_id', membership.organization_id)
      .order('is_default', { ascending: false })
      .order('usage_count', { ascending: false })
      .order('updated_at', { ascending: false });
    if (kind && KINDS.has(kind)) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      templates: (data ?? []).map((t: any) => ({
        id: t.id,
        kind: t.kind ?? t.type,
        name: t.name ?? t.title,
        body: t.body_text ?? (typeof t.body === 'string' ? t.body : (t.body?.text ?? '')),
        variables: t.variables ?? [],
        is_default: !!t.is_default,
        usage_count: t.usage_count ?? 0,
        last_used_at: t.last_used_at,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { kind?: string; name?: string; body?: string; variables?: unknown[]; is_default?: boolean };
    if (!body.kind || !KINDS.has(body.kind)) return res.status(400).json({ error: 'Invalid kind.' });
    const name = (body.name ?? '').trim();
    const text = (body.body ?? '').trim();
    if (!name || !text) return res.status(400).json({ error: 'name and body required.' });

    if (body.is_default) {
      // Clear other defaults for this kind first.
      await client
        .from('templates')
        .update({ is_default: false })
        .eq('organization_id', membership.organization_id)
        .eq('kind', body.kind);
    }

    const { data, error } = await client
      .from('templates')
      .insert({
        organization_id: membership.organization_id,
        created_by_user_id: userData.user.id,
        type: body.kind,
        kind: body.kind,
        title: name,
        name,
        body: { text },
        body_text: text,
        variables: Array.isArray(body.variables) ? body.variables : [],
        is_default: !!body.is_default,
      })
      .select('id')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });

    await writeAudit(client, {
      organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: membership.role,
      action: 'template.created', entityType: 'template', entityId: data?.id ?? null as any,
      payload: { entity_name: name, kind: body.kind },
    });

    return res.status(200).json({ id: data?.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
