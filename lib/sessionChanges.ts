// Shared helpers for session reschedule / cancel / propose flows.
// Used by tutor API routes and parent API routes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './email';

export type ChangeType =
  | 'created'
  | 'proposed_reschedule' | 'confirmed_reschedule' | 'rejected_reschedule'
  | 'proposed_cancel' | 'confirmed_cancel' | 'rejected_cancel';

export async function logSessionChange(
  admin: SupabaseClient,
  args: {
    sessionId: string;
    changedByUserId: string;
    changeType: ChangeType;
    oldStartTime?: string | null;
    newStartTime?: string | null;
    message?: string | null;
  },
): Promise<void> {
  await admin.from('session_change_log').insert({
    session_id: args.sessionId,
    changed_by_user_id: args.changedByUserId,
    change_type: args.changeType,
    old_start_time: args.oldStartTime ?? null,
    new_start_time: args.newStartTime ?? null,
    message: args.message ?? null,
  });
}

export function formatAuDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

// ---------------------------------------------------------------------------
// Notify the other side of a change. Non-fatal if email fails.
// ---------------------------------------------------------------------------
export async function emailParentOfTutorChange(
  admin: SupabaseClient,
  args: {
    sessionId: string;
    studentId: string;
    kind: 'rescheduled' | 'cancelled';
    oldStartTime: string;
    newStartTime?: string | null;
    message?: string | null;
  },
): Promise<void> {
  try {
    const { data: links } = await admin
      .from('parent_student_links')
      .select('parent:parents!inner(email, name)')
      .eq('student_id', args.studentId)
      .is('revoked_at', null);
    const recipients = ((links ?? []) as any[])
      .map((l) => l.parent?.email).filter(Boolean) as string[];
    if (recipients.length === 0) return;

    const { data: student } = await admin
      .from('students').select('name').eq('id', args.studentId).maybeSingle();
    const name = student?.name ?? 'your child';

    const subject =
      args.kind === 'rescheduled'
        ? `${name}'s session has been rescheduled`
        : `${name}'s session has been cancelled`;

    const oldDt = formatAuDateTime(args.oldStartTime);
    const newDt = args.newStartTime ? formatAuDateTime(args.newStartTime) : null;

    const textLines: string[] = [];
    if (args.kind === 'rescheduled' && newDt) {
      textLines.push(`${name}'s tutoring session has been rescheduled.`);
      textLines.push(`Was: ${oldDt}`);
      textLines.push(`Now: ${newDt}`);
    } else {
      textLines.push(`${name}'s tutoring session scheduled for ${oldDt} has been cancelled.`);
    }
    if (args.message) textLines.push('', args.message);
    textLines.push('', 'You can view your calendar by signing in to Crestio.');

    const html = `<p>${textLines.slice(0, 3).join('<br/>')}</p>${
      args.message ? `<p>${escapeHtml(args.message)}</p>` : ''
    }<p style="color:#6B6660;font-size:13px;">View your calendar by signing in to Crestio.</p>`;

    for (const to of recipients) {
      await sendEmail({ to, subject, html, text: textLines.join('\n') });
    }
  } catch (e) {
    console.error('[sessionChanges] email parent failed', e);
  }
}

export async function emailTutorOfParentProposal(
  admin: SupabaseClient,
  args: {
    sessionId: string;
    studentId: string;
    tutorUserId: string;
    kind: 'reschedule' | 'cancel';
    oldStartTime: string;
    proposedNewStartTime?: string | null;
    message?: string | null;
  },
): Promise<void> {
  try {
    const { data: tutorProfile } = await admin
      .from('profiles').select('email, owner_name').eq('id', args.tutorUserId).maybeSingle();
    if (!tutorProfile?.email) return;

    const { data: student } = await admin
      .from('students').select('name').eq('id', args.studentId).maybeSingle();
    const name = student?.name ?? 'a student';

    const oldDt = formatAuDateTime(args.oldStartTime);
    const newDt = args.proposedNewStartTime
      ? formatAuDateTime(args.proposedNewStartTime) : null;

    const subject =
      args.kind === 'reschedule'
        ? `A parent requested rescheduling ${name}'s session`
        : `A parent requested cancelling ${name}'s session`;

    const textLines: string[] = [];
    textLines.push(
      args.kind === 'reschedule'
        ? `A parent requested to reschedule ${name}'s session.`
        : `A parent requested to cancel ${name}'s session.`,
    );
    textLines.push(`Originally scheduled: ${oldDt}`);
    if (args.kind === 'reschedule' && newDt) textLines.push(`Proposed new time: ${newDt}`);
    if (args.message) textLines.push('', args.message);
    textLines.push('', 'Open Crestio to approve or reject.');

    const html = `<p>${textLines.slice(0, 3).join('<br/>')}</p>${
      args.message ? `<p><em>Parent note:</em><br/>${escapeHtml(args.message)}</p>` : ''
    }<p><a href="https://crestio.ai/app/calendar">Open Crestio to approve or reject</a></p>`;

    await sendEmail({ to: tutorProfile.email, subject, html, text: textLines.join('\n') });
  } catch (e) {
    console.error('[sessionChanges] email tutor failed', e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
