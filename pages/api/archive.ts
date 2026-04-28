import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAuditBatch } from '../../lib/audit';
import { ENTITY_SPECS, EntityType, isValidEntityType } from '../../lib/entitySchema';

// POST /api/archive
// Body: { entity_type: EntityType, ids: string[], reason?: string,
//         cascade?: boolean }
//
// Archives one or more rows of the given entity type.  "Archive" means setting
// archived_at + archived_by + archive_reason.  Default views hide archived
// rows; restore is forever via Trash.
//
// Cascade rules (only applied when cascade === true; the default when
// archiving a household with the ConfirmDrawer's cascade preview):
//   household → archive parents in household_parents, students with household_id,
//               session_templates for those students.
//   student   → no auto-archive of sessions; templates with effective_until = now;
//               files remain.
//   parent    → portal access disabled (commit 2). For now: revoke parent_student_links.
//   tutor     → owners only. Sessions remain, students stay assigned.
//
// Audit: writes one row per archived item with action "<type>.archived".

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

  const body = (req.body ?? {}) as {
    entity_type?: string;
    ids?: string[];
    reason?: string;
    cascade?: boolean;
  };
  if (!body.entity_type || !isValidEntityType(body.entity_type)) {
    return res.status(400).json({ error: 'Invalid entity_type.' });
  }
  const entityType = body.entity_type as EntityType;
  const ids = (body.ids ?? []).filter((id) => typeof id === 'string');
  if (ids.length === 0) return res.status(400).json({ error: 'No ids provided.' });

  const spec = ENTITY_SPECS[entityType];
  if (!spec.archiveCol) {
    return res.status(400).json({ error: `${spec.label} does not support archive — use soft-delete.` });
  }

  // Tutor archive is owner-only.
  if (entityType === 'tutor' && membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can archive tutors.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Verify every id belongs to the caller's org before mutating anything.
  const { data: rows } = await admin
    .from(spec.table)
    .select(`id, ${spec.orgColumn}, ${spec.displayColumn}`)
    .in('id', ids);
  const visible = (rows ?? []).filter((r: any) => r[spec.orgColumn] === membership.organization_id);
  if (visible.length === 0) return res.status(404).json({ error: 'Nothing to archive.' });

  const visibleIds = visible.map((r: any) => r.id);
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    archived_at: now,
    archived_by: userId,
    archive_reason: body.reason ?? null,
  };

  // households — older migrations don't have updated_at trigger; safe to skip.
  const { error: updErr } = await admin
    .from(spec.table)
    .update(updatePayload)
    .in('id', visibleIds);
  if (updErr) return res.status(500).json({ error: updErr.message });

  // Cascade.
  let cascadeSummary: Record<string, number> = {};
  if (body.cascade) {
    cascadeSummary = await applyCascade(admin, entityType, visibleIds, userId, body.reason ?? null);
  }

  // Per-id-and-cascade archive row in the audit log.
  await writeAuditBatch(
    admin,
    visible.map((row: any) => ({
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: `${entityType}.archived`,
      entityType,
      entityId: row.id,
      payload: {
        entity_name: row[spec.displayColumn],
        reason: body.reason ?? null,
        cascade: body.cascade ?? false,
        cascade_summary: cascadeSummary,
      },
    })),
  );

  return res.status(200).json({
    ok: true,
    archived: visibleIds.length,
    cascade: cascadeSummary,
  });
}

async function applyCascade(
  admin: SupabaseClient,
  entityType: EntityType,
  ids: string[],
  userId: string,
  reason: string | null,
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};
  const now = new Date().toISOString();
  const meta = { archived_at: now, archived_by: userId, archive_reason: reason };

  if (entityType === 'household') {
    // Archive every student in these households.
    const { data: studentRows } = await admin
      .from('students')
      .select('id')
      .in('household_id', ids)
      .is('archived_at', null);
    const studentIds = (studentRows ?? []).map((s) => s.id);
    if (studentIds.length > 0) {
      await admin.from('students').update(meta).in('id', studentIds);
      summary.students = studentIds.length;
      // Pause templates for those students.
      const { data: tplRows } = await admin
        .from('session_templates')
        .select('id')
        .in('student_id', studentIds)
        .is('archived_at', null);
      const tplIds = (tplRows ?? []).map((t) => t.id);
      if (tplIds.length > 0) {
        await admin.from('session_templates').update(meta).in('id', tplIds);
        summary.templates = tplIds.length;
      }
    }
    // Archive every parent linked through household_parents.
    const { data: linkRows } = await admin
      .from('household_parents')
      .select('parent_id')
      .in('household_id', ids);
    const parentIds = Array.from(new Set((linkRows ?? []).map((l) => l.parent_id)));
    if (parentIds.length > 0) {
      await admin.from('parents').update(meta).in('id', parentIds);
      summary.parents = parentIds.length;
    }
  } else if (entityType === 'student') {
    // Templates for the student → archived.
    const { data: tplRows } = await admin
      .from('session_templates')
      .select('id')
      .in('student_id', ids)
      .is('archived_at', null);
    const tplIds = (tplRows ?? []).map((t) => t.id);
    if (tplIds.length > 0) {
      await admin.from('session_templates').update(meta).in('id', tplIds);
      summary.templates = tplIds.length;
    }
  } else if (entityType === 'parent') {
    // Revoke parent_student_links (parent loses portal visibility).
    const { count: revoked } = await admin
      .from('parent_student_links')
      .update({ revoked_at: now })
      .in('parent_id', ids)
      .is('revoked_at', null);
    if (revoked) summary.links_revoked = revoked;
  }

  return summary;
}
