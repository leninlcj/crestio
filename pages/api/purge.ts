import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAudit } from '../../lib/audit';
import { ENTITY_SPECS, EntityType, isValidEntityType } from '../../lib/entitySchema';

// POST /api/purge
// Body: { entity_type: EntityType, ids: string[], confirm: 'DELETE' }
//
// Hard-delete.  Owner-only.  Requires `confirm === 'DELETE'` to enable
// (matches the type-to-confirm UI pattern).  Allowed for:
//   - rows already archived/soft-deleted >= 30 days ago
//   - any row when caller is owner AND types DELETE (immediate purge)
//
// Invoices: never hard-deletable unless status='void' for >= 30 days.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can permanently delete.' });
  }

  const body = (req.body ?? {}) as { entity_type?: string; ids?: string[]; confirm?: string };
  if (body.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Confirmation required. Type DELETE.' });
  }
  if (!body.entity_type || !isValidEntityType(body.entity_type)) {
    return res.status(400).json({ error: 'Invalid entity_type.' });
  }
  const entityType = body.entity_type as EntityType;
  const ids = (body.ids ?? []).filter((id) => typeof id === 'string');
  if (ids.length === 0) return res.status(400).json({ error: 'No ids provided.' });

  const spec = ENTITY_SPECS[entityType];

  // Invoices: only purgeable when voided >= 30 days ago.
  if (entityType === 'invoice') {
    const adminPre = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: rows } = await adminPre
      .from('invoices')
      .select('id, status, voided_at, organization_id')
      .in('id', ids);
    const blockers = (rows ?? []).filter((r: any) =>
      r.organization_id === membership.organization_id
      && (r.status !== 'void' || !r.voided_at || r.voided_at > cutoff)
    );
    if (blockers.length > 0) {
      return res.status(400).json({
        error: 'Invoices can only be purged 30 days after voiding.',
        blocked_ids: blockers.map((b: any) => b.id),
      });
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: rows } = await admin
    .from(spec.table)
    .select(`id, ${spec.orgColumn}, ${spec.displayColumn}`)
    .in('id', ids);
  const visible = (rows ?? []).filter((r: any) => r[spec.orgColumn] === membership.organization_id);
  if (visible.length === 0) return res.status(404).json({ error: 'Nothing to purge.' });

  const visibleIds = visible.map((r: any) => r.id);

  const { error: delErr } = await admin
    .from(spec.table)
    .delete()
    .in('id', visibleIds);
  if (delErr) return res.status(500).json({ error: delErr.message });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'purge.completed',
    entityType,
    payload: {
      count: visibleIds.length,
      entity_names: visible.map((r: any) => r[spec.displayColumn]).slice(0, 50),
    },
  });

  return res.status(200).json({ ok: true, purged: visibleIds.length });
}
