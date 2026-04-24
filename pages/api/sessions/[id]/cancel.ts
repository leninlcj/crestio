import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { logSessionChange, emailParentOfTutorChange, formatAuDateTime } from '../../../../lib/sessionChanges';
import { createNotification } from '../../../../lib/notifications';

// POST /api/sessions/[id]/cancel
// Body: { message?: string }
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
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const sessionId = req.query.id as string;
  const body = (req.body ?? {}) as Record<string, any>;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: session } = await admin
    .from('sessions')
    .select('id, organization_id, student_id, scheduled_at, tutor_user_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (membership.role === 'tutor' && session.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only cancel your own sessions.' });
  }
  if (session.status === 'completed') {
    return res.status(400).json({ error: 'Cannot cancel a completed session.' });
  }

  const { error } = await admin.from('sessions').update({
    status: 'cancelled',
    proposed_change_by: null,
    proposed_new_start_time: null,
    proposed_new_duration_minutes: null,
    proposed_by_user_id: null,
    proposed_at: null,
    change_message: null,
  }).eq('id', sessionId);
  if (error) return res.status(500).json({ error: error.message });

  await logSessionChange(admin, {
    sessionId,
    changedByUserId: userId,
    changeType: 'confirmed_cancel',
    oldStartTime: session.scheduled_at,
    message: body.message ? String(body.message) : null,
  });

  await emailParentOfTutorChange(admin, {
    sessionId,
    studentId: session.student_id,
    kind: 'cancelled',
    oldStartTime: session.scheduled_at,
    message: body.message ? String(body.message) : null,
  });

  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', session.student_id).maybeSingle();
    const studentName = (student?.name as string) ?? 'your child';
    const { data: links } = await admin
      .from('parent_student_links')
      .select('parent:parents!inner(auth_user_id)')
      .eq('student_id', session.student_id)
      .is('revoked_at', null);
    for (const l of (links ?? []) as any[]) {
      const uid = l.parent?.auth_user_id;
      if (!uid) continue;
      await createNotification(admin, {
        userId: uid,
        type: 'session_cancelled',
        titleKey: 'session_cancelled.title',
        bodyKey: 'session_cancelled.body',
        templateVars: { student: studentName, old_time: formatAuDateTime(session.scheduled_at) },
        linkUrl: `/parent/student/${session.student_id}`,
        context: { session_id: sessionId },
        emailOverride: false,
      });
    }
  } catch (e) {
    console.error('[sessions/cancel] notification fan-out failed', e);
  }

  return res.status(200).json({ ok: true });
}
