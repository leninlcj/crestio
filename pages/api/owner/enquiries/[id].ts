import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { writeAudit } from '../../../../lib/audit';

const STATUSES = ['new', 'contacted', 'trial_booked', 'matched', 'lost', 'spam'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/owner/enquiries/[id]  { status?, owner_notes?, assigned_tutor_id? }
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
    if (body.status === 'contacted') patch.contacted_at = new Date().toISOString();
  }
  if (typeof body.owner_notes === 'string') patch.owner_notes = body.owner_notes.slice(0, 4000);
  if (body.assigned_tutor_id === null) patch.assigned_tutor_id = null;
  else if (typeof body.assigned_tutor_id === 'string') {
    if (!UUID_RE.test(body.assigned_tutor_id)) return res.status(400).json({ error: 'invalid_tutor' });
    const { data: tutor } = await ctx.admin
      .from('tutors').select('id').eq('id', body.assigned_tutor_id).eq('organization_id', org.id).maybeSingle();
    if (!tutor) return res.status(400).json({ error: 'invalid_tutor' });
    patch.assigned_tutor_id = body.assigned_tutor_id;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await ctx.admin
    .from('enquiries')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', org.id)
    .select('id, status, owner_notes, assigned_tutor_id, contacted_at, converted_at, updated_at')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });

  await writeAudit(ctx.admin, {
    organizationId: org.id,
    actorUserId: ctx.userId,
    actorRole: 'owner',
    action: 'enquiry.updated',
    entityType: 'enquiry',
    entityId: id,
    payload: { fields: Object.keys(patch), status: patch.status ?? null },
  });

  return res.status(200).json({ enquiry: data });
}
