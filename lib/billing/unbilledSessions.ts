import type { SupabaseClient } from '@supabase/supabase-js';

// A session that hasn't been billed yet — shape used by the batch UI and API.
export type UnbilledSession = {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  charge_rate_cents: number | null;
  amount_cents: number;
  student_id: string;
  student_name: string;
  student_hourly_rate_cents: number | null;
  household_id: string | null;
  late_cancellation?: boolean;
};

export type GetUnbilledOptions = {
  organizationId: string;
  periodStart: Date;  // inclusive
  periodEnd: Date;    // exclusive
  tutorUserId?: string | null;
};

// Returns completed sessions in the period that are not yet on any invoice.
// Reads from the public.unbilled_completed_sessions view so the Home tile and
// the Batch invoice page agree on the same definition of "unbilled":
//   * status = 'completed'
//   * not soft-deleted
//   * not on the legacy sessions.invoice_id link
//   * not on the batch invoice_sessions join table
// Test records are filtered post-query because the view doesn't carry the
// student.is_test_record flag.
export async function getUnbilledSessions(
  admin: SupabaseClient,
  options: GetUnbilledOptions,
): Promise<UnbilledSession[]> {
  const { organizationId, periodStart, periodEnd, tutorUserId } = options;

  let q = admin
    .from('unbilled_completed_sessions')
    .select(
      'id, scheduled_at, duration_minutes, subject, topic, charge_rate_cents, student_id, invoice_id, tutor_user_id, organization_id, status, late_cancellation, student:students!inner(id, name, hourly_rate_cents, household_id, is_test_record)'
    )
    .eq('organization_id', organizationId)
    .gte('scheduled_at', periodStart.toISOString())
    .lt('scheduled_at', periodEnd.toISOString())
    .order('scheduled_at', { ascending: true });

  if (tutorUserId) q = q.eq('tutor_user_id', tutorUserId);

  const { data: rows, error } = await q;
  if (error) throw new Error(`getUnbilledSessions: ${error.message}`);
  const all = (rows ?? []) as any[];
  if (all.length === 0) return [];

  const result: UnbilledSession[] = [];
  for (const s of all) {
    if (s.student?.is_test_record) continue;
    const rateCents =
      s.charge_rate_cents ?? s.student?.hourly_rate_cents ?? null;
    const amount = rateCents ? Math.round((rateCents * s.duration_minutes) / 60) : 0;
    result.push({
      session_id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      subject: s.subject,
      topic: s.topic,
      charge_rate_cents: rateCents,
      amount_cents: amount,
      student_id: s.student_id,
      student_name: s.student?.name ?? 'Unknown',
      student_hourly_rate_cents: s.student?.hourly_rate_cents ?? null,
      household_id: s.student?.household_id ?? null,
      late_cancellation: s.status === 'cancelled' && s.late_cancellation === true,
    });
  }
  return result;
}
