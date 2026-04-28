import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';

// POST /api/student-access/disable
// Body: { student_id: string, reason?: string }
//
// Tutor / owner can disable a student's portal access at any time.  Effects:
//   - student_portal_access.disabled_at + reason set, enabled=false
//   - student_users.disabled_at set
//   - auth.users banned_until = far future (effectively a hard sign-out)
//   - audit_log entry

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { student_id?: string; reason?: string };
  if (!body.student_id) return res.status(400).json({ error: 'student_id required.' });
  const reason = (body.reason ?? '').trim() || null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, organization_id, student_id')
    .eq('student_id', body.student_id)
    .maybeSingle();
  if (!access || access.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Access record not found.' });
  }

  const now = new Date().toISOString();
  await admin
    .from('student_portal_access')
    .update({ enabled: false, disabled_at: now, disabled_reason: reason, invitation_token: null, parental_consent_token: null, updated_at: now })
    .eq('id', access.id);

  // Disable the student_users row + sign-out the auth.users entry.
  const { data: studentUser } = await admin
    .from('student_users')
    .select('id, auth_user_id, full_name')
    .eq('student_id', body.student_id)
    .maybeSingle();
  if (studentUser) {
    await admin
      .from('student_users')
      .update({ disabled_at: now, disabled_reason: reason, updated_at: now })
      .eq('id', studentUser.id);

    if (studentUser.auth_user_id) {
      try {
        // Ban for 100 years — effectively permanent until restored.
        await (admin.auth.admin as any).updateUserById(studentUser.auth_user_id, {
          ban_duration: '876000h',
          app_metadata: { role: 'student', portal_disabled: true },
        });
      } catch (err) {
        console.warn('[student-access/disable] auth update failed', err);
      }
    }
  }

  const { data: student } = await admin.from('students').select('name').eq('id', body.student_id).maybeSingle();

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'student_access.disabled',
    entityType: 'student',
    entityId: body.student_id,
    payload: { entity_name: student?.name, reason, source: 'tutor' },
  });

  return res.status(200).json({ ok: true });
}
