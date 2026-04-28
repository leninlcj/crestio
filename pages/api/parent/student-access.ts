import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/parent/student-access?student_id=...
// Parent-only.  Returns the access record + last_login for the student.

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

  const studentId = req.query.student_id as string | undefined;
  if (!studentId) return res.status(400).json({ error: 'student_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Only parents.' });

  const { data: link } = await admin
    .from('parent_student_links').select('id')
    .eq('parent_id', parent.id).eq('student_id', studentId).is('revoked_at', null).maybeSingle();
  if (!link) return res.status(403).json({ error: 'Not linked.' });

  const { data: student } = await admin
    .from('students').select('name').eq('id', studentId).maybeSingle();

  const { data: access } = await admin
    .from('student_portal_access')
    .select('enabled, parental_consent_required, parental_consent_given_at, invitation_email, invitation_sent_at, accepted_at, enabled_at, disabled_at, disabled_reason')
    .eq('student_id', studentId).maybeSingle();

  const { data: studentUser } = await admin
    .from('student_users').select('last_login_at').eq('student_id', studentId).maybeSingle();

  return res.status(200).json({
    student_name: student?.name ?? null,
    access: access ?? null,
    last_login_at: studentUser?.last_login_at ?? null,
  });
}
