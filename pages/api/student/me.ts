import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/student/me — student's own profile + tutor branding for the layout.
// PATCH /api/student/me — update email + notification preferences.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: studentUser } = await admin
    .from('student_users')
    .select('id, student_id, full_name, email, date_of_birth, last_login_at, disabled_at')
    .eq('auth_user_id', userData.user.id).maybeSingle();
  if (!studentUser || studentUser.disabled_at) return res.status(404).json({ error: 'Not found.' });

  if (req.method === 'GET') {
    const { data: student } = await admin.from('students').select('id, organization_id').eq('id', studentUser.student_id).maybeSingle();
    const { data: org } = await admin
      .from('organizations').select('name, brand_color, owner_user_id').eq('id', student?.organization_id ?? '').maybeSingle();
    let tutorReplyTo: string | null = null;
    if (org?.owner_user_id) {
      const { data: profile } = await admin.from('profiles').select('email').eq('id', org.owner_user_id).maybeSingle();
      tutorReplyTo = profile?.email ?? null;
    }
    return res.status(200).json({
      profile: {
        id: studentUser.id,
        student_id: studentUser.student_id,
        full_name: studentUser.full_name,
        email: studentUser.email,
        date_of_birth: studentUser.date_of_birth,
        last_login_at: studentUser.last_login_at,
      },
      tutor: { name: org?.name ?? 'Your tutor', brandColor: org?.brand_color ?? null, replyTo: tutorReplyTo },
    });
  }

  if (req.method === 'PATCH') {
    return res.status(501).json({ error: 'Email change requires verification — coming soon.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
