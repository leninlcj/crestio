// Calendar-access-token helpers. Tokens are URL-embedded bearer auth for the
// ICS feed endpoints — the only place unauthenticated requests can access a
// user's sessions. Long opaque strings; generated server-side.

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export type CalendarTokenAudience = 'tutor' | 'parent' | 'parent_student';

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

// Get-or-create a token for the given user + audience + optional student.
// If an active (unrevoked) token already exists with the same scope, reuse
// it so users don't end up with 12 calendar subscriptions.
export async function getOrCreateCalendarToken(
  admin: SupabaseClient,
  args: {
    userId: string;
    audience: CalendarTokenAudience;
    studentId?: string | null;
  },
): Promise<{ token: string; created: boolean }> {
  const { userId, audience, studentId = null } = args;

  let existingQ = admin
    .from('calendar_access_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('audience', audience)
    .is('revoked_at', null)
    .limit(1);
  if (studentId === null) {
    existingQ = existingQ.is('student_id', null);
  } else {
    existingQ = existingQ.eq('student_id', studentId);
  }
  const { data: existing } = await existingQ.maybeSingle();
  if (existing?.token) return { token: existing.token, created: false };

  const token = randomToken();
  const { error } = await admin.from('calendar_access_tokens').insert({
    user_id: userId, audience, token, student_id: studentId,
  });
  if (error) {
    console.error('[calendarTokens] insert failed', error);
    throw new Error('Could not create calendar token.');
  }
  return { token, created: true };
}

export async function revokeCalendarToken(
  admin: SupabaseClient,
  tokenId: string,
  userId: string,
): Promise<void> {
  await admin
    .from('calendar_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('user_id', userId);
}

// Look up a token (used by the public ICS endpoints). Returns the token row
// if active, null if revoked/missing. Also bumps last_accessed_at.
export async function resolveActiveToken(
  admin: SupabaseClient,
  token: string,
): Promise<{
  id: string;
  user_id: string;
  audience: CalendarTokenAudience;
  student_id: string | null;
} | null> {
  const { data } = await admin
    .from('calendar_access_tokens')
    .select('id, user_id, audience, student_id, revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  // Fire-and-forget last-accessed bump.
  admin
    .from('calendar_access_tokens')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined, () => undefined);
  return {
    id: data.id,
    user_id: data.user_id,
    audience: data.audience as CalendarTokenAudience,
    student_id: data.student_id ?? null,
  };
}
