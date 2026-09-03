import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { writeAudit } from '../../../../lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/owner/incidents/[id] { status?, outcome? }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });
  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    if (!['open', 'reviewing', 'closed'].includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
    patch.status = body.status;
    patch.closed_at = body.status === 'closed' ? new Date().toISOString() : null;
  }
  if (typeof body.outcome === 'string') patch.outcome = body.outcome.slice(0, 5000);
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await ctx.admin
    .from('incidents').update(patch).eq('id', id).eq('organization_id', org.id)
    .select('id, status, outcome, closed_at, updated_at').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });

  await writeAudit(ctx.admin, { organizationId: org.id, actorUserId: ctx.userId, actorRole: 'owner', action: 'incident.updated', entityType: 'incident', entityId: id, payload: { status: patch.status ?? null } });
  return res.status(200).json({ incident: data });
}
