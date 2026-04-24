// Shared helpers for the messaging API. Keep thread resolution, permission
// checks, and email-throttling logic in one place so all endpoints behave
// identically.

import type { SupabaseClient } from '@supabase/supabase-js';

export const EMAIL_THROTTLE_MINUTES = 30;
export const MAX_BODY_CHARS = 5000;

export type Urgency = 'urgent' | 'normal' | 'info';
export type SenderType = 'tutor' | 'parent';

// ---------------------------------------------------------------------------
// Resolve the tutor for a student. Students have primary_tutor_id → tutors.id;
// we need the tutor's auth user id to use as the message's tutor_user_id.
// Falls back to the org owner if the student has no primary tutor.
// ---------------------------------------------------------------------------
export async function resolveStudentTutorUserId(
  admin: SupabaseClient,
  studentId: string,
): Promise<{ tutorUserId: string; organizationId: string } | null> {
  const { data: student } = await admin
    .from('students')
    .select('id, primary_tutor_id, organization_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return null;
  const organizationId = student.organization_id as string;

  if (student.primary_tutor_id) {
    const { data: tutor } = await admin
      .from('tutors')
      .select('auth_user_id')
      .eq('id', student.primary_tutor_id)
      .maybeSingle();
    if (tutor?.auth_user_id) {
      return { tutorUserId: tutor.auth_user_id as string, organizationId };
    }
  }

  const { data: org } = await admin
    .from('organizations').select('owner_user_id').eq('id', organizationId).maybeSingle();
  if (!org?.owner_user_id) return null;
  return { tutorUserId: org.owner_user_id as string, organizationId };
}

// Get the parents.id for an auth user id (null if the user isn't a parent).
export async function resolveParentRowForUser(
  admin: SupabaseClient,
  authUserId: string,
): Promise<{ parentId: string; email: string; name: string | null } | null> {
  const { data } = await admin
    .from('parents')
    .select('id, email, name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (!data) return null;
  return { parentId: data.id as string, email: data.email as string, name: data.name as string | null };
}

// Verify the parent (by parents.id) is linked to the student.
export async function parentLinkedToStudent(
  admin: SupabaseClient,
  parentId: string,
  studentId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', parentId)
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Find-or-create a thread for a (student, parent, tutor) triple. Unique
// constraint on the triple prevents duplicates across concurrent calls.
// ---------------------------------------------------------------------------
export async function findOrCreateThread(
  admin: SupabaseClient,
  args: {
    organizationId: string;
    studentId: string;
    parentId: string;
    tutorUserId: string;
  },
): Promise<{ threadId: string; created: boolean }> {
  const { data: existing } = await admin
    .from('message_threads')
    .select('id')
    .eq('student_id', args.studentId)
    .eq('parent_id', args.parentId)
    .eq('tutor_user_id', args.tutorUserId)
    .maybeSingle();
  if (existing?.id) return { threadId: existing.id as string, created: false };

  const { data: inserted, error } = await admin
    .from('message_threads')
    .insert({
      organization_id: args.organizationId,
      student_id: args.studentId,
      parent_id: args.parentId,
      tutor_user_id: args.tutorUserId,
    })
    .select('id')
    .maybeSingle();
  if (error || !inserted) {
    // Race: another request created it between our SELECT and INSERT. Re-read.
    const { data: retry } = await admin
      .from('message_threads')
      .select('id')
      .eq('student_id', args.studentId)
      .eq('parent_id', args.parentId)
      .eq('tutor_user_id', args.tutorUserId)
      .maybeSingle();
    if (retry?.id) return { threadId: retry.id as string, created: false };
    throw new Error(error?.message ?? 'Could not create thread.');
  }
  return { threadId: inserted.id as string, created: true };
}

// ---------------------------------------------------------------------------
// Unread count for a viewer in a given thread.
// ---------------------------------------------------------------------------
export function unreadCountFor(
  messages: Array<{ created_at: string; sender_type: SenderType }>,
  viewer: SenderType,
  lastReadAt: string | null,
): number {
  const cutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter((m) =>
    m.sender_type !== viewer && new Date(m.created_at).getTime() > cutoff
  ).length;
}

// ---------------------------------------------------------------------------
// Email throttling: only send if (a) the recipient is opted in, and
// (b) we haven't already emailed within the throttle window.
// ---------------------------------------------------------------------------
export function shouldSendEmail(args: {
  optedIn: boolean;
  urgentOnly: boolean;
  messageUrgency: Urgency | null;
  recipientLastEmailAt: string | null;
}): boolean {
  if (!args.optedIn) return false;
  if (args.urgentOnly && args.messageUrgency !== 'urgent') return false;
  if (!args.recipientLastEmailAt) return true;
  const ageMs = Date.now() - new Date(args.recipientLastEmailAt).getTime();
  return ageMs >= EMAIL_THROTTLE_MINUTES * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------
export function previewOfBody(body: string, max = 140): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}
