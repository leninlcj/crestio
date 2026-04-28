import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// GET /api/student-access/state?student_id=...
// Tutor / owner — returns the access record so the StudentAccessCard can
// render status and decide which buttons to show.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No org membership.' });

  const studentId = req.query.student_id as string | undefined;
  if (!studentId) return res.status(400).json({ error: 'student_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: student } = await admin
    .from('students').select('id, organization_id').eq('id', studentId).maybeSingle();
  if (!student || student.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const { data: access } = await admin
    .from('student_portal_access')
    .select('enabled, parental_consent_required, parental_consent_given_at, invitation_email, invitation_sent_at, invitation_expires_at, accepted_at, enabled_at, disabled_at, disabled_reason')
    .eq('student_id', studentId).maybeSingle();

  return res.status(200).json({ access: access ?? null });
}
