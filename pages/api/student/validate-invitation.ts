import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/student/validate-invitation?token=...
// Public route — no auth required.  Validates the invitation token and
// returns the metadata the accept page renders, without leaking org details.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ valid: false, error: 'Server misconfigured.' });

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).json({ valid: false, reason: 'missing' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, organization_id, student_id, invitation_email, invitation_expires_at, accepted_at, parental_consent_required, parental_consent_given_at')
    .eq('invitation_token', token)
    .maybeSingle();
  if (!access) return res.status(404).json({ valid: false, reason: 'not_found' });
  if (access.accepted_at) return res.status(400).json({ valid: false, reason: 'used' });
  if (access.invitation_expires_at && new Date(access.invitation_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ valid: false, reason: 'expired' });
  }
  if (access.parental_consent_required && !access.parental_consent_given_at) {
    return res.status(400).json({ valid: false, reason: 'consent_pending' });
  }

  const { data: student } = await admin
    .from('students').select('name, date_of_birth').eq('id', access.student_id).maybeSingle();
  const { data: org } = await admin
    .from('organizations').select('name, brand_color').eq('id', access.organization_id).maybeSingle();

  return res.status(200).json({
    valid: true,
    email: access.invitation_email,
    studentName: student?.name ?? '',
    dateOfBirth: student?.date_of_birth ?? null,
    tutorBusinessName: org?.name ?? 'Your tutor',
    brandColor: org?.brand_color ?? null,
  });
}
