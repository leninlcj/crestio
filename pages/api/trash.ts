import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { ENTITY_SPECS, EntityType, isValidEntityType } from '../../lib/entitySchema';

// GET /api/trash?entity_type=<type>
// Returns the list of archived/soft-deleted rows for one entity type.
// Used by the Trash page in Settings.

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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const entityTypeRaw = req.query.entity_type as string | undefined;
  if (!entityTypeRaw || !isValidEntityType(entityTypeRaw)) {
    return res.status(400).json({ error: 'Invalid entity_type.' });
  }
  const entityType = entityTypeRaw as EntityType;
  const spec = ENTITY_SPECS[entityType];

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const cols = ['id', spec.displayColumn];
  if (spec.archiveCol) cols.push('archived_at', 'archived_by', 'archive_reason');
  if (spec.softDeleteCol) cols.push('deleted_at', 'deleted_by');

  const filter = (q: any) => {
    if (spec.archiveCol && spec.softDeleteCol) {
      return q.or('archived_at.not.is.null,deleted_at.not.is.null');
    } else if (spec.archiveCol) {
      return q.not('archived_at', 'is', null);
    }
    return q.not('deleted_at', 'is', null);
  };

  const { data, error } = await filter(
    admin
      .from(spec.table)
      .select(cols.join(','))
      .eq(spec.orgColumn, membership.organization_id)
  ).order(spec.archiveCol ?? spec.softDeleteCol!, { ascending: false }).limit(500);

  if (error) return res.status(500).json({ error: error.message });

  // Resolve actor names.
  const actorIds = Array.from(new Set(
    (data ?? []).flatMap((r: any) => [r.archived_by, r.deleted_by]).filter(Boolean),
  )) as string[];
  let actorMap: Record<string, string | null> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, owner_name, email')
      .in('id', actorIds);
    actorMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.owner_name ?? p.email ?? null]),
    );
  }

  return res.status(200).json({
    rows: (data ?? []).map((r: any) => {
      const archivedAt = r.archived_at as string | null;
      const deletedAt = r.deleted_at as string | null;
      const at = archivedAt ?? deletedAt;
      const actorId = r.archived_by ?? r.deleted_by ?? null;
      return {
        id: r.id,
        label: r[spec.displayColumn] as string,
        from: archivedAt ? 'archive' : 'soft-delete',
        at,
        purges_at: deletedAt
          ? new Date(new Date(deletedAt).getTime() + 30 * 86400_000).toISOString()
          : null,
        actor_id: actorId,
        actor: actorId ? actorMap[actorId] ?? null : null,
        reason: r.archive_reason ?? null,
      };
    }),
  });
}
