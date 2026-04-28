import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

// GET  /api/tags?q=               — list tags (optionally filtered by name)
// POST /api/tags                  — create tag { name, color? }

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
    const q = (req.query.q as string | undefined)?.trim() ?? '';
    let query = client
      .from('tags_with_counts')
      .select('id, organization_id, name, color, live_usage, created_at')
      .eq('organization_id', membership.organization_id)
      .order('live_usage', { ascending: false })
      .order('name', { ascending: true })
      .limit(50);
    if (q) query = query.ilike('name', `%${q}%`);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      tags: (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        usage_count: t.live_usage ?? 0,
        created_at: t.created_at,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { name?: string; color?: string };
    const name = (body.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required.' });
    if (name.length > 40) return res.status(400).json({ error: 'name too long.' });
    const color = isHex(body.color) ? body.color! : '#6b7280';

    const { data, error } = await client
      .from('tags')
      .insert({ organization_id: membership.organization_id, name, color, created_by: userData.user.id })
      .select('id, name, color')
      .maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        // Already exists — return existing.
        const { data: existing } = await client
          .from('tags')
          .select('id, name, color')
          .eq('organization_id', membership.organization_id)
          .ilike('name', name)
          .maybeSingle();
        if (existing) return res.status(200).json({ tag: existing, existed: true });
      }
      return res.status(500).json({ error: error.message });
    }

    await writeAudit(client, {
      organizationId: membership.organization_id,
      actorUserId: userData.user.id,
      actorRole: membership.role,
      action: 'tag.created',
      entityType: 'tag',
      entityId: data!.id,
      payload: { entity_name: data!.name },
    });

    return res.status(200).json({ tag: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function isHex(c: string | undefined): boolean {
  return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);
}
