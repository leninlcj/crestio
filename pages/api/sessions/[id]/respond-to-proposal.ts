import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { logSessionChange, emailParentOfTutorChange, formatAuDateTime } from '../../../../lib/sessionChanges';
import { createNotification, type NotificationType } from '../../../../lib/notifications';

// POST /api/sessions/[id]/respond-to-proposal
// Body: { decision: 'accept' | 'reject', message?: string }
// The session must currently be in pending_change state with
// proposed_change_by='parent'. Tutor accepts → applies new time (reschedule)
// or cancels (cancel). Tutor rejects → reverts to scheduled with old time.
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
  const decision = String(body.decision ?? '');
  if (decision !== 'accept' && decision !== 'reject') {
    return res.status(400).json({ error: 'decision must be accept or reject.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: session } = await admin
    .from('sessions')
    .select('id, organization_id, student_id, scheduled_at, duration_minutes, tutor_user_id, status, proposed_change_by, proposed_new_start_time, proposed_new_duration_minutes')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (membership.role === 'tutor' && session.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only respond to proposals on your own sessions.' });
  }
  if (session.status !== 'pending_change' || session.proposed_change_by !== 'parent') {
    return res.status(400).json({ error: 'This session has no pending parent proposal.' });
  }

  // Infer reschedule vs cancel proposal: reschedule has a proposed new time.
  const isReschedule = !!session.proposed_new_start_time;
  const msg = body.message ? String(body.message) : null;

  if (decision === 'accept') {
    if (isReschedule) {
      const update: Record<string, unknown> = {
        scheduled_at: session.proposed_new_start_time,
        status: 'scheduled',
        proposed_change_by: null,
        proposed_new_start_time: null,
        proposed_new_duration_minutes: null,
        proposed_by_user_id: null,
        proposed_at: null,
        change_message: null,
      };
      if (session.proposed_new_duration_minutes) {
        update.duration_minutes = session.proposed_new_duration_minutes;
      }
      const { error } = await admin.from('sessions').update(update).eq('id', sessionId);
      if (error) return res.status(500).json({ error: error.message });

      await logSessionChange(admin, {
        sessionId, changedByUserId: userId, changeType: 'confirmed_reschedule',
        oldStartTime: session.scheduled_at,
        newStartTime: session.proposed_new_start_time,
        message: msg,
      });
      await emailParentOfTutorChange(admin, {
        sessionId, studentId: session.student_id,
        kind: 'rescheduled',
        oldStartTime: session.scheduled_at,
        newStartTime: session.proposed_new_start_time,
        message: msg ?? 'Your requested reschedule has been confirmed.',
      });
      await notifyParentsOfSession(admin, {
        sessionId,
        studentId: session.student_id,
        type: 'reschedule_accepted',
        titleSuffix: 'reschedule confirmed',
        newTime: session.proposed_new_start_time,
      });
      return res.status(200).json({ ok: true, outcome: 'rescheduled' });
    }

    // cancel-proposal accept
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
      sessionId, changedByUserId: userId, changeType: 'confirmed_cancel',
      oldStartTime: session.scheduled_at, message: msg,
    });
    await emailParentOfTutorChange(admin, {
      sessionId, studentId: session.student_id,
      kind: 'cancelled', oldStartTime: session.scheduled_at,
      message: msg ?? 'Your cancellation request has been confirmed.',
    });
    await notifyParentsOfSession(admin, {
      sessionId,
      studentId: session.student_id,
      type: 'reschedule_accepted',
      titleSuffix: 'cancellation confirmed',
    });
    return res.status(200).json({ ok: true, outcome: 'cancelled' });
  }

  // decision === 'reject' → revert to scheduled, clear proposal fields
  const { error } = await admin.from('sessions').update({
    status: 'scheduled',
    proposed_change_by: null,
    proposed_new_start_time: null,
    proposed_new_duration_minutes: null,
    proposed_by_user_id: null,
    proposed_at: null,
    change_message: null,
  }).eq('id', sessionId);
  if (error) return res.status(500).json({ error: error.message });

  await logSessionChange(admin, {
    sessionId, changedByUserId: userId,
    changeType: isReschedule ? 'rejected_reschedule' : 'rejected_cancel',
    oldStartTime: session.scheduled_at,
    newStartTime: session.proposed_new_start_time,
    message: msg,
  });

  // Notify parent of the rejection.
  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', session.student_id).maybeSingle();
    const name = student?.name ?? 'your child';
    const subjectLine = isReschedule
      ? `Reschedule request declined: ${name}'s session stays as scheduled`
      : `Cancellation request declined: ${name}'s session stays as scheduled`;
    const { sendEmail } = await import('../../../../lib/email');
    const { data: parentLinks } = await admin
      .from('parent_student_links')
      .select('parent:parents!inner(email)')
      .eq('student_id', session.student_id)
      .is('revoked_at', null);
    const recipients = ((parentLinks ?? []) as any[])
      .map((l) => l.parent?.email).filter(Boolean) as string[];
    const textBody =
      `Your request to ${isReschedule ? 'reschedule' : 'cancel'} ${name}'s session has been declined. ` +
      `The session remains scheduled.` +
      (msg ? `\n\nNote from the tutor:\n${msg}` : '');
    for (const to of recipients) {
      await sendEmail({
        to, subject: subjectLine,
        text: textBody,
        html: `<p>${textBody.replace(/\n/g, '<br/>')}</p>`,
      });
    }
  } catch (e) {
    console.error('[respond-to-proposal] reject email failed', e);
  }

  await notifyParentsOfSession(admin, {
    sessionId,
    studentId: session.student_id,
    type: 'reschedule_rejected',
    titleSuffix: isReschedule ? 'reschedule declined' : 'cancellation declined',
  });

  return res.status(200).json({ ok: true, outcome: 'rejected' });
}

// Fan-out notifications to every linked parent of this student. Each one
// is an independent createNotification so prefs apply per-parent.
async function notifyParentsOfSession(
  admin: any,
  args: {
    sessionId: string;
    studentId: string;
    type: NotificationType;
    titleSuffix: string;
    newTime?: string | null;
  },
): Promise<void> {
  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', args.studentId).maybeSingle();
    const studentName = (student?.name as string) ?? 'your child';
    const { data: links } = await admin
      .from('parent_student_links')
      .select('parent:parents!inner(auth_user_id)')
      .eq('student_id', args.studentId)
      .is('revoked_at', null);
    const parentUserIds = ((links ?? []) as any[])
      .map((l) => l.parent?.auth_user_id).filter(Boolean) as string[];
    for (const uid of parentUserIds) {
      await createNotification(admin, {
        userId: uid,
        type: args.type,
        titleKey: args.type === 'reschedule_rejected' ? 'reschedule_rejected.title' : 'reschedule_accepted.title',
        bodyKey: args.type === 'reschedule_rejected' ? 'reschedule_rejected.body' : 'reschedule_accepted.body',
        templateVars: {
          student: studentName,
          suffix: args.titleSuffix,
          new_time: args.newTime ? formatAuDateTime(args.newTime) : '',
        },
        linkUrl: `/parent/student/${args.studentId}`,
        context: { session_id: args.sessionId },
        emailOverride: false, // emailParentOfTutorChange already handled it
      });
    }
  } catch (e) {
    console.error('[respond-to-proposal] in-app notification fan-out failed', e);
  }
}
