import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAuditBatch } from '../../lib/audit';
import { ENTITY_SPECS, EntityType, isValidEntityType } from '../../lib/entitySchema';

// POST /api/soft-delete
// Body: { entity_type: EntityType, ids: string[] }
//
// Sets deleted_at + deleted_by on rows, hiding them everywhere.  After 30 days
// the cron at /api/cron/purge-deleted hard-deletes them.  Caller can restore
// any time within that window via /api/restore.

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

  const body = (req.body ?? {}) as { entity_type?: string; ids?: string[] };
  if (!body.entity_type || !isValidEntityType(body.entity_type)) {
    return res.status(400).json({ error: 'Invalid entity_type.' });
  }
  const entityType = body.entity_type as EntityType;
  const ids = (body.ids ?? []).filter((id) => typeof id === 'string');
  if (ids.length === 0) return res.status(400).json({ error: 'No ids provided.' });

  const spec = ENTITY_SPECS[entityType];
  if (!spec.softDeleteCol) {
    return res.status(400).json({ error: `${spec.label} does not support soft-delete.` });
  }

  // Invoices specifically — never soft-delete a sent/paid invoice.  Use void.
  if (entityType === 'invoice') {
    const adminCheck = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: rows } = await adminCheck
      .from('invoices')
      .select('id, status, organization_id')
      .in('id', ids);
    const blockers = (rows ?? []).filter((r: any) =>
      r.organization_id === membership.organization_id
      && r.status !== 'draft' && r.status !== 'void'
    );
    if (blockers.length > 0) {
      return res.status(400).json({
        error: 'Sent or paid invoices cannot be deleted — void them instead.',
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
  if (visible.length === 0) return res.status(404).json({ error: 'Nothing to delete.' });

  const visibleIds = visible.map((r: any) => r.id);
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from(spec.table)
    .update({ deleted_at: now, deleted_by: userId })
    .in('id', visibleIds);
  if (updErr) return res.status(500).json({ error: updErr.message });

  await writeAuditBatch(
    admin,
    visible.map((row: any) => ({
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: `${entityType}.deleted`,
      entityType,
      entityId: row.id,
      payload: { entity_name: row[spec.displayColumn] },
    })),
  );

  return res.status(200).json({ ok: true, deleted: visibleIds.length });
}
