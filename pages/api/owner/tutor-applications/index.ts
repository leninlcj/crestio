import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { TUTOR_PAY_BANDS } from '../../../../lib/agency';

// GET /api/owner/tutor-applications?status=open|all|<status>&q=
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;

  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let query = ctx.admin
    .from('tutor_applications')
    .select('id, created_at, updated_at, status, full_name, email, phone, suburb, subjects, qualifications, wwcc_status, wwcc_number, abn, mode, availability, has_transport, experience, cv_url, message, source, owner_notes, interview_at, decided_at, tutor_invitation_id, tutor_id')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status === 'open') query = query.in('status', ['new', 'screening', 'interview', 'test', 'offer']);
  else if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let rows = data ?? [];
  if (q) {
    rows = rows.filter((r: any) =>
      [r.full_name, r.email, r.phone, r.suburb, r.qualifications, (r.subjects ?? []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }

  return res.status(200).json({ applications: rows, pay_bands: TUTOR_PAY_BANDS });
}
