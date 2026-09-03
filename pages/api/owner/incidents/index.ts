import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { isMissingTableError } from '../../../../lib/dbErrors';

// GET /api/owner/incidents?status=open|reviewing|closed|all
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  let query = ctx.admin
    .from('incidents')
    .select('id, created_at, updated_at, reported_by_role, reporter_name, reporter_email, student_id, tutor_id, session_id, occurred_at, category, description, status, outcome, closed_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (status === 'open') query = query.in('status', ['open', 'reviewing']);
  else if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (isMissingTableError(error)) return res.status(200).json({ incidents: [], setup_required: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ incidents: data ?? [] });
}
