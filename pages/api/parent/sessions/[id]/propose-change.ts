import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { logSessionChange, emailTutorOfParentProposal, formatAuDateTime } from '../../../../../lib/sessionChanges';
import { createNotification } from '../../../../../lib/notifications';

// POST /api/parent/sessions/[id]/propose-change
// Body: {
//   kind: 'reschedule' | 'cancel',
//   new_start_time?: ISO (required for reschedule),
//   new_duration_minutes?: number,
//   message?: string
// }
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
  const parentAuthId = userData.user.id;

  const sessionId = req.query.id as string;
  const body = (req.body ?? {}) as Record<string, any>;
  const kind = String(body.kind ?? '');
  if (kind !== 'reschedule' && kind !== 'cancel') {
    return res.status(400).json({ error: 'kind must be reschedule or cancel.' });
  }
  const newStart = kind === 'reschedule' ? String(body.new_start_time ?? '') : '';
  if (kind === 'reschedule') {
    if (!newStart || Number.isNaN(new Date(newStart).getTime())) {
      return res.status(400).json({ error: 'new_start_time required for reschedule.' });
    }
    if (new Date(newStart).getTime() < Date.now() + 60_000) {
      return res.status(400).json({ error: 'Proposed time must be in the future.' });
    }
  }
  const newDuration = body.new_duration_minutes != null ? Number(body.new_duration_minutes) : null;
  const message = body.message ? String(body.message) : null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Verify parent is linked to this session's student.
  const { data: parent } = await admin
    .from('parents').select('id').eq('auth_user_id', parentAuthId).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Parent account not found.' });

  const { data: session } = await admin
    .from('sessions')
    .select('id, student_id, scheduled_at, duration_minutes, status, tutor_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  // Parent must be actively linked to the student.
  const { data: link } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', parent.id)
    .eq('student_id', session.student_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (!link) return res.status(403).json({ error: 'No access to this session.' });

  // Can't propose changes on past sessions.
  if (new Date(session.scheduled_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "Can't request changes on a past session." });
  }
  if (session.status === 'completed' || session.status === 'cancelled') {
    return res.status(400).json({ error: `This session is ${session.status}.` });
  }

  const update: Record<string, unknown> = {
    status: 'pending_change',
    proposed_change_by: 'parent',
    proposed_new_start_time: kind === 'reschedule' ? newStart : null,
    proposed_new_duration_minutes: kind === 'reschedule' && newDuration && newDuration > 0
      ? newDuration : null,
    proposed_by_user_id: parentAuthId,
    proposed_at: new Date().toISOString(),
    change_message: message,
  };
  const { error: updateErr } = await admin.from('sessions').update(update).eq('id', sessionId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await logSessionChange(admin, {
    sessionId,
    changedByUserId: parentAuthId,
    changeType: kind === 'reschedule' ? 'proposed_reschedule' : 'proposed_cancel',
    oldStartTime: session.scheduled_at,
    newStartTime: kind === 'reschedule' ? newStart : null,
    message,
  });

  // In-app notification to the tutor. emailOverride:false because the
  // dedicated emailTutorOfParentProposal below has richer context than the
  // generic notification email builder.
  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', session.student_id).maybeSingle();
    const studentName = (student?.name as string) ?? 'a student';
    const { data: parentInfo } = await admin
      .from('parents').select('name').eq('auth_user_id', parentAuthId).maybeSingle();
    const parentName = (parentInfo?.name as string | null) ?? 'A parent';
    const oldWhen = formatAuDateTime(session.scheduled_at);
    const newWhen = kind === 'reschedule' ? formatAuDateTime(newStart) : null;
    const title = kind === 'reschedule'
      ? `${parentName} requested to reschedule ${studentName}'s session`
      : `${parentName} requested to cancel ${studentName}'s session`;
    const bodyParts: string[] = [];
    if (kind === 'reschedule' && newWhen) bodyParts.push(`Original: ${oldWhen} → Proposed: ${newWhen}`);
    else bodyParts.push(`Scheduled for ${oldWhen}`);
    if (message) bodyParts.push('', message);
    await createNotification(admin, {
      userId: session.tutor_user_id,
      type: 'reschedule_requested',
      title,
      body: bodyParts.join('\n'),
      linkUrl: `/app/sessions/${sessionId}`,
      context: { session_id: sessionId, kind, proposed_new_start_time: newWhen },
      dedupeKey: `reschedule_requested:${sessionId}:${new Date().toISOString()}`,
      emailOverride: false,
    });
  } catch (e) {
    console.error('[parent/propose-change] notification failed', e);
  }

  await emailTutorOfParentProposal(admin, {
    sessionId,
    studentId: session.student_id,
    tutorUserId: session.tutor_user_id,
    kind,
    oldStartTime: session.scheduled_at,
    proposedNewStartTime: kind === 'reschedule' ? newStart : null,
    message,
  });

  return res.status(200).json({ ok: true });
}
