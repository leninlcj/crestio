import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';

// GET /api/select-all-ids?entity=students&filters=<json>
//
// Returns up to 10000 ids for the caller's filtered set so the client can
// run a bulk action across pages.  `filters` is the same shape the list
// view already passes to its main fetch.

const CAP = 10000;

const ENTITY_MAP: Record<string, { table: string; orderBy?: { col: string; ascending: boolean } }> = {
  students:     { table: 'students', orderBy: { col: 'name', ascending: true } },
  sessions:     { table: 'sessions', orderBy: { col: 'scheduled_at', ascending: false } },
  invoices:     { table: 'invoices', orderBy: { col: 'issued_on', ascending: false } },
  files:        { table: 'files', orderBy: { col: 'created_at', ascending: false } },
  lesson_plans: { table: 'lesson_plans', orderBy: { col: 'created_at', ascending: false } },
};

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

  const entity = req.query.entity as string;
  const spec = ENTITY_MAP[entity];
  if (!spec) return res.status(400).json({ error: 'Unsupported entity.' });

  let filters: Record<string, unknown> = {};
  try {
    if (typeof req.query.filters === 'string') filters = JSON.parse(req.query.filters);
  } catch { /* ignore */ }

  let q = client.from(spec.table).select('id', { count: 'exact' })
    .eq('organization_id', membership.organization_id);

  // Hide soft-deleted/archived rows from "all matching" by default.
  if (entity !== 'invoices') q = q.is('deleted_at', null).is('archived_at', null);
  else q = q.is('deleted_at', null);

  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '') continue;
    if (k === 'tag_ids' && Array.isArray(v) && v.length > 0) {
      // Subquery: ids that have at least one of the given tag_ids.
      const { data: tagged } = await client
        .from('entity_tags').select('entity_id')
        .eq('entity_type', entity.replace(/s$/, '')) // students → student
        .in('tag_id', v as string[]);
      const ids = (tagged ?? []).map((r: any) => r.entity_id);
      if (ids.length === 0) return res.status(200).json({ ids: [], count: 0 });
      q = q.in('id', ids);
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      q = q.eq(k, v);
    }
  }

  if (spec.orderBy) q = q.order(spec.orderBy.col, { ascending: spec.orderBy.ascending });
  q = q.limit(CAP);

  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({
    ids: (data ?? []).map((r: any) => r.id),
    count: count ?? data?.length ?? 0,
    capped: (count ?? 0) > CAP,
  });
}
