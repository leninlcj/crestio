import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { getMembershipForUser } from '../../../lib/membership';
import { checkRateLimit } from '../../../lib/rateLimit';
import {
  findOrCreateThread,
  parentLinkedToStudent,
  previewOfBody,
  resolveParentRowForUser,
  resolveStudentTutorUserId,
  shouldSendEmail,
  type SenderType,
  type Urgency,
  MAX_BODY_CHARS,
} from '../../../lib/messaging';
import {
  buildMessageEmailForTutor,
  buildMessageEmailForParent,
} from '../../../lib/emails/messageNotification';
import { getBaseUrl } from '../../../lib/stripe';
import { createNotification } from '../../../lib/notifications';

// POST /api/messages/send
// Body: { student_id, body, urgency?, parent_id? }
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

  // Rate limit: 60 messages / hour / user. Soft in-memory.
  const rl = checkRateLimit({
    key: `messages:${userId}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as {
    student_id?: string;
    parent_id?: string;
    body?: string;
    urgency?: string;
  };
  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!studentId) return res.status(400).json({ error: 'student_id required.' });
  if (!messageBody) return res.status(400).json({ error: 'Message body is empty.' });
  if (messageBody.length > MAX_BODY_CHARS) {
    return res.status(400).json({ error: `Message exceeds ${MAX_BODY_CHARS} characters.` });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Is the sender a tutor (membership check) or a parent (parents row)?
  const membership = await getMembershipForUser(userClient, userId);
  const parentRow = await resolveParentRowForUser(admin, userId);

  let senderType: SenderType;
  let organizationId: string;
  let parentId: string;
  let tutorUserId: string;

  if (membership) {
    senderType = 'tutor';
    // Sender is a tutor/owner. They must be allowed to message about this student:
    // either the student's assigned tutor OR the org owner.
    const resolved = await resolveStudentTutorUserId(admin, studentId);
    if (!resolved) return res.status(404).json({ error: 'Student not found.' });
    if (resolved.organizationId !== membership.organization_id) {
      return res.status(403).json({ error: 'Student is not in your organisation.' });
    }
    const isAssignedTutor = resolved.tutorUserId === userId;
    const isOwner = membership.role === 'owner';
    if (!isAssignedTutor && !isOwner) {
      return res.status(403).json({ error: 'You are not assigned to this student.' });
    }

    organizationId = resolved.organizationId;
    tutorUserId = resolved.tutorUserId; // always the student's assigned tutor — new messages go there

    // Tutor must pick a parent to message (students may have multiple linked parents).
    const parentIdInput = typeof body.parent_id === 'string' ? body.parent_id : '';
    if (!parentIdInput) {
      return res.status(400).json({ error: 'parent_id required when a tutor sends a message.' });
    }
    // Verify that parent is linked to the student.
    const linked = await parentLinkedToStudent(admin, parentIdInput, studentId);
    if (!linked) return res.status(403).json({ error: 'Parent is not linked to this student.' });
    parentId = parentIdInput;
  } else if (parentRow) {
    senderType = 'parent';
    // Sender is a parent. They must be linked to the student.
    const linked = await parentLinkedToStudent(admin, parentRow.parentId, studentId);
    if (!linked) return res.status(403).json({ error: "You don't have access to message about this student." });

    const resolved = await resolveStudentTutorUserId(admin, studentId);
    if (!resolved) return res.status(404).json({ error: 'Student not found.' });
    organizationId = resolved.organizationId;
    parentId = parentRow.parentId;
    tutorUserId = resolved.tutorUserId;
  } else {
    return res.status(403).json({ error: 'You are not a member or parent on Crestio.' });
  }

  // Urgency: only valid when sender is tutor.
  const urgencyInput = typeof body.urgency === 'string' ? body.urgency : null;
  let urgency: Urgency | null = null;
  if (urgencyInput && ['urgent', 'normal', 'info'].includes(urgencyInput)) {
    if (senderType !== 'tutor') {
      return res.status(400).json({ error: 'Urgency can only be set on tutor messages.' });
    }
    urgency = urgencyInput as Urgency;
  }
  // Normalise: 'normal' is the absence of a label — store null.
  if (urgency === 'normal') urgency = null;

  // Find-or-create the thread, then insert the message in the same round-trip.
  const { threadId } = await findOrCreateThread(admin, {
    organizationId,
    studentId,
    parentId,
    tutorUserId,
  });

  const { data: inserted, error: insertErr } = await admin
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_type: senderType,
      sender_user_id: userId,
      body: messageBody,
      urgency,
    })
    .select('id, created_at')
    .maybeSingle();
  if (insertErr || !inserted) {
    console.error('[messages/send] insert failed', insertErr);
    return res.status(500).json({ error: 'Could not send message.' });
  }

  // Bump thread fields: preview, last_message_at, and the sender's own last_read_at
  // (they just authored it; no unread notification for themselves).
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_message_at: nowIso,
    last_message_preview: previewOfBody(messageBody),
  };
  if (senderType === 'tutor') update.tutor_last_read_at = nowIso;
  else update.parent_last_read_at = nowIso;
  await admin.from('message_threads').update(update).eq('id', threadId);

  // In-app notification row for the recipient. Email is still handled by
  // notifyOther() below which keeps the per-thread throttle from Session 13E —
  // we pass emailOverride:false so createNotification skips email dispatch
  // and only writes the in-app feed row.
  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', studentId).maybeSingle();
    const studentName = (student?.name as string) ?? 'your student';
    if (senderType === 'tutor') {
      // Recipient is the parent.
      const { data: parent } = await admin
        .from('parents').select('auth_user_id').eq('id', parentId).maybeSingle();
      if (parent?.auth_user_id) {
        const { data: tutorProfile } = await admin
          .from('profiles').select('owner_name').eq('id', tutorUserId).maybeSingle();
        const tutorName = (tutorProfile?.owner_name as string | null) ?? 'Your tutor';
        await createNotification(admin, {
          userId: parent.auth_user_id as string,
          type: urgency === 'urgent' ? 'message_urgent' : 'message_received',
          title: `New message from ${tutorName} about ${studentName}`,
          body: previewOfBody(messageBody, 140),
          linkUrl: `/parent/messages/${threadId}`,
          context: { thread_id: threadId, student_id: studentId, sender_user_id: userId, urgency },
          emailOverride: false, // notifyOther() handles email via Session 13E's throttling
        });
      }
    } else {
      // Recipient is the tutor.
      const { data: parent } = await admin
        .from('parents').select('name').eq('id', parentId).maybeSingle();
      const parentName = (parent?.name as string | null) ?? 'A parent';
      await createNotification(admin, {
        userId: tutorUserId,
        type: 'message_received',
        title: `New message from ${parentName} about ${studentName}`,
        body: previewOfBody(messageBody, 140),
        linkUrl: `/app/messages/${threadId}`,
        context: { thread_id: threadId, student_id: studentId, sender_user_id: userId },
        emailOverride: false,
      });
    }
  } catch (e) {
    console.error('[messages/send] in-app notification failed', e);
  }

  // Fire email to the other side — non-fatal on failure.
  await notifyOther(admin, {
    req,
    threadId,
    senderType,
    studentId,
    parentId,
    tutorUserId,
    urgency,
    bodyPreview: messageBody,
  });

  return res.status(200).json({
    ok: true,
    thread_id: threadId,
    message: {
      id: inserted.id,
      thread_id: threadId,
      sender_type: senderType,
      sender_user_id: userId,
      body: messageBody,
      urgency,
      created_at: inserted.created_at,
    },
  });
}

async function notifyOther(
  admin: SupabaseClient,
  args: {
    req: NextApiRequest;
    threadId: string;
    senderType: SenderType;
    studentId: string;
    parentId: string;
    tutorUserId: string;
    urgency: Urgency | null;
    bodyPreview: string;
  },
): Promise<void> {
  try {
    const { data: student } = await admin
      .from('students').select('name').eq('id', args.studentId).maybeSingle();
    const studentName = (student?.name as string) ?? 'your student';

    const { data: thread } = await admin
      .from('message_threads')
      .select('tutor_last_email_at, parent_last_email_at')
      .eq('id', args.threadId)
      .maybeSingle();
    if (!thread) return;

    const baseUrl = getBaseUrl(args.req);

    if (args.senderType === 'tutor') {
      // Notify parent.
      const { data: parent } = await admin
        .from('parents')
        .select('email, name, notify_messages_email, notify_messages_urgent_only')
        .eq('id', args.parentId)
        .maybeSingle();
      if (!parent?.email) return;

      const send = shouldSendEmail({
        optedIn: parent.notify_messages_email !== false,
        urgentOnly: parent.notify_messages_urgent_only === true,
        messageUrgency: args.urgency,
        recipientLastEmailAt: thread.parent_last_email_at as string | null,
      });
      if (!send) return;

      // Tutor's display name comes from profiles.owner_name.
      const { data: tutorProfile } = await admin
        .from('profiles').select('owner_name').eq('id', args.tutorUserId).maybeSingle();

      const email = buildMessageEmailForParent({
        tutorName: (tutorProfile?.owner_name as string | null) ?? null,
        studentName,
        urgency: args.urgency,
        bodyPreview: args.bodyPreview,
        threadUrl: `${baseUrl}/parent/messages/${args.threadId}`,
        notificationSettingsUrl: `${baseUrl}/parent/settings`,
      });
      const result = await sendEmail({ to: parent.email as string, ...email });
      if (result.success) {
        await admin
          .from('message_threads')
          .update({ parent_last_email_at: new Date().toISOString() })
          .eq('id', args.threadId);
      } else {
        console.error('[message/email/failed]', result.error);
      }
    } else {
      // Notify tutor.
      const { data: tutorProfile } = await admin
        .from('profiles')
        .select('email, owner_name, notify_messages_email, notify_messages_urgent_only')
        .eq('id', args.tutorUserId)
        .maybeSingle();
      if (!tutorProfile?.email) return;

      const send = shouldSendEmail({
        optedIn: tutorProfile.notify_messages_email !== false,
        urgentOnly: tutorProfile.notify_messages_urgent_only === true,
        messageUrgency: args.urgency,
        recipientLastEmailAt: thread.tutor_last_email_at as string | null,
      });
      if (!send) return;

      const { data: parent } = await admin
        .from('parents').select('name').eq('id', args.parentId).maybeSingle();

      const email = buildMessageEmailForTutor({
        parentName: (parent?.name as string | null) ?? null,
        studentName,
        bodyPreview: args.bodyPreview,
        threadUrl: `${baseUrl}/app/messages/${args.threadId}`,
        notificationSettingsUrl: `${baseUrl}/app/settings/notifications`,
      });
      const result = await sendEmail({ to: tutorProfile.email as string, ...email });
      if (result.success) {
        await admin
          .from('message_threads')
          .update({ tutor_last_email_at: new Date().toISOString() })
          .eq('id', args.threadId);
      } else {
        console.error('[message/email/failed]', result.error);
      }
    }
  } catch (e) {
    console.error('[message/email/failed]', e);
  }
}
