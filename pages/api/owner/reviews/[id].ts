import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { writeAudit } from '../../../../lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pages whose static HTML shows approved reviews. Revalidated on approve/hide
// so the site changes within seconds rather than at the next hourly rebuild.
export const REVIEW_PAGES = ['/', '/about'] as const;

// PATCH /api/owner/reviews/[id] { status?: 'approved'|'hidden'|'declined', reviewer_name?, reviewer_suburb? }
// The body of a review is never editable here: a family's words stay theirs.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });
  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const { data: current } = await ctx.admin
    .from('reviews').select('id, status, consent_public, rating, body, reviewer_name').eq('id', id).eq('organization_id', org.id).maybeSingle();
  if (!current) return res.status(404).json({ error: 'not_found' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    if (!['approved', 'hidden', 'declined'].includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
    if ((current as any).status === 'requested') return res.status(400).json({ error: 'The family has not written anything yet.' });
    if (body.status === 'approved') {
      if (!(current as any).consent_public) return res.status(400).json({ error: 'The family did not give permission to show this review.' });
      if (!(current as any).rating || !(current as any).body) return res.status(400).json({ error: 'Nothing to approve.' });
      patch.approved_at = new Date().toISOString();
      patch.approved_by = ctx.userId;
    }
    patch.status = body.status;
  }
  if (typeof body.reviewer_name === 'string') {
    const name = body.reviewer_name.trim().slice(0, 80);
    if (name.length < 2) return res.status(400).json({ error: 'The display name needs at least two characters.' });
    patch.reviewer_name = name;
  }
  if (typeof body.reviewer_suburb === 'string') patch.reviewer_suburb = body.reviewer_suburb.trim().slice(0, 60) || null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await ctx.admin
    .from('reviews').update(patch).eq('id', id).eq('organization_id', org.id)
    .select('id, status, approved_at, reviewer_name, reviewer_suburb, updated_at').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });

  // Rebuild the public pages that show reviews. Best-effort.
  let revalidated = false;
  try {
    for (const path of REVIEW_PAGES) await res.revalidate(path);
    revalidated = true;
  } catch (e) {
    console.warn('[reviews] revalidate failed', e);
  }

  await writeAudit(ctx.admin, { organizationId: org.id, actorUserId: ctx.userId, actorRole: 'owner', action: 'review.updated', entityType: 'review', entityId: id, payload: { status: patch.status ?? null } });
  return res.status(200).json({ review: data, revalidated });
}
