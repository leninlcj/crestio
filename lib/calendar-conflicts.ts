// Conflict detection for session scheduling. Pure functions that take a
// candidate session and a list of existing sessions, return what kind of
// conflict (if any) was found.
//
// Two kinds of conflict:
//   blocking — same student, time overlap. Save is refused.
//   warning — same tutor, candidate falls within bufferMinutes of an
//             existing session. Save proceeds with a confirmation prompt.

export type CandidateSession = {
  scheduled_at: string;       // ISO
  duration_minutes: number;
  student_id: string;
  tutor_user_id?: string | null;
  // When updating an existing session, exclude it from the conflict check.
  ignore_session_id?: string;
};

export type ExistingSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_id: string | null;
  student_name?: string | null;
  tutor_user_id?: string | null;
  tutor_name?: string | null;
  status: string;
};

export type ConflictResult =
  | { kind: 'none' }
  | { kind: 'blocking'; with_session: ExistingSession; reason: string }
  | { kind: 'warning'; with_session: ExistingSession; reason: string };

export function findConflict(
  candidate: CandidateSession,
  existing: ExistingSession[],
  bufferMinutes: number,
): ConflictResult {
  const candStart = new Date(candidate.scheduled_at).getTime();
  if (Number.isNaN(candStart)) return { kind: 'none' };
  const candEnd = candStart + candidate.duration_minutes * 60_000;

  // Same-student overlap is always blocking.
  for (const s of existing) {
    if (s.id === candidate.ignore_session_id) continue;
    if (s.status === 'cancelled' || s.status === 'no_show') continue;
    if (!s.student_id) continue;
    if (s.student_id !== candidate.student_id) continue;
    const start = new Date(s.scheduled_at).getTime();
    const end = start + s.duration_minutes * 60_000;
    if (overlap(candStart, candEnd, start, end)) {
      return {
        kind: 'blocking',
        with_session: s,
        reason: `${s.student_name ?? 'This student'} already has a session at ${formatHM(s.scheduled_at)}.`,
      };
    }
  }

  // Same-tutor buffer warning.
  if (bufferMinutes > 0 && candidate.tutor_user_id) {
    const bufferMs = bufferMinutes * 60_000;
    for (const s of existing) {
      if (s.id === candidate.ignore_session_id) continue;
      if (s.status === 'cancelled' || s.status === 'no_show') continue;
      if (!s.tutor_user_id || s.tutor_user_id !== candidate.tutor_user_id) continue;
      const start = new Date(s.scheduled_at).getTime();
      const end = start + s.duration_minutes * 60_000;
      // Distance between the two intervals (0 if overlapping).
      const gap = candStart >= end
        ? candStart - end
        : start >= candEnd
        ? start - candEnd
        : 0;
      if (gap < bufferMs) {
        const tutorName = s.tutor_name ?? 'Another session';
        const minutes = Math.round(gap / 60_000);
        const overlapping = gap === 0;
        return {
          kind: 'warning',
          with_session: s,
          reason: overlapping
            ? `${tutorName} overlaps another session at ${formatHM(s.scheduled_at)}.`
            : `${tutorName} is ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} from ${s.student_name ?? 'another session'} at ${formatHM(s.scheduled_at)}.`,
        };
      }
    }
  }

  return { kind: 'none' };
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
