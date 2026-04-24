import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ valid: false, error: 'Server misconfigured.' });
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).json({ valid: false, error: 'Missing token.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: invitation } = await admin
    .from('tutor_invitations')
    .select('id, email, organization_id, invited_by_user_id, accepted_at, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invitation) {
    return res.status(404).json({ valid: false, error: 'Invitation not found.' });
  }
  if (invitation.accepted_at) {
    return res.status(400).json({ valid: false, error: 'This invitation has already been used.' });
  }
  if (invitation.revoked_at) {
    return res.status(400).json({ valid: false, error: 'This invitation has been revoked.' });
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ valid: false, error: 'This invitation has expired.' });
  }

  const [{ data: org }, { data: inviter }] = await Promise.all([
    admin.from('organizations').select('name').eq('id', invitation.organization_id).single(),
    admin.from('profiles').select('email').eq('id', invitation.invited_by_user_id).single(),
  ]);

  return res.status(200).json({
    valid: true,
    email: invitation.email,
    org_name: org?.name ?? 'Your tutor',
    inviter_email: inviter?.email ?? '',
  });
}
