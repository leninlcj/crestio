import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { isMissingTableError } from '../../../../lib/dbErrors';

// GET /api/owner/enquiries?status=new|contacted|trial_booked|matched|lost|spam|open|all&q=
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;

  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let query = ctx.admin
    .from('enquiries')
    .select('*')  // '*' so the list works before and after the chunk 6 columns exist
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status === 'open') query = query.in('status', ['new', 'contacted', 'trial_booked']);
  else if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (isMissingTableError(error)) {
    return res.status(200).json({ enquiries: [], tutors: [], setup_required: true, migration: 'supabase/migrations/20260903_agency_enquiries_applications.sql' });
  }
  if (error) return res.status(500).json({ error: error.message });

  let rows = data ?? [];
  if (q) {
    rows = rows.filter((r: any) =>
      [r.parent_name, r.email, r.phone, r.student_first_name, r.suburb, r.year_level, (r.subjects ?? []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }

  // Tutor names for assignment display.
  const { data: tutors } = await ctx.admin
    .from('tutors')
    .select('id, name, subjects, suburb, mode')
    .eq('organization_id', org.id)
    .eq('archived', false)
    .order('name');

  const safe = rows.map((r: Record<string, unknown>) => {
    const { ip_hash: _ip, ...rest } = r;
    return rest;
  });
  return res.status(200).json({ enquiries: safe, tutors: tutors ?? [] });
}
