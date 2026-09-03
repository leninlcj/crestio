import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { writeAudit } from '../../../../lib/audit';

const STATUSES = ['new', 'screening', 'interview', 'test', 'offer', 'accepted', 'rejected', 'withdrawn'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/owner/tutor-applications/[id]  { status?, owner_notes?, interview_at? (ISO|null) }
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
    if (!(STATUSES as readonly string[]).includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
    patch.status = body.status;
    if (['accepted', 'rejected', 'withdrawn'].includes(body.status)) patch.decided_at = new Date().toISOString();
  }
  if (typeof body.owner_notes === 'string') patch.owner_notes = body.owner_notes.slice(0, 4000);
  if (body.interview_at === null) patch.interview_at = null;
  else if (typeof body.interview_at === 'string') {
    const d = new Date(body.interview_at);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid_interview_at' });
    patch.interview_at = d.toISOString();
    if (!patch.status) patch.status = 'interview';
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await ctx.admin
    .from('tutor_applications')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', org.id)
    .select('id, status, owner_notes, interview_at, decided_at, updated_at')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });

  await writeAudit(ctx.admin, {
    organizationId: org.id,
    actorUserId: ctx.userId,
    actorRole: 'owner',
    action: 'tutor_application.updated',
    entityType: 'tutor_application',
    entityId: id,
    payload: { fields: Object.keys(patch), status: patch.status ?? null },
  });

  return res.status(200).json({ application: data });
}
