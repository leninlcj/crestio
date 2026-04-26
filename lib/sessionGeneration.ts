// Generate session rows from a session template for the next N days.
// Idempotent — checks for existing sessions with the same template_id +
// scheduled_at before inserting. Safe to call repeatedly.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  localDateTimeToUtcIso,
  nextWeekdayOnOrAfter,
  addDaysIso,
  localDateInTz,
} from './timezone';

const DEFAULT_HORIZON_DAYS = 90;

export type SessionTemplate = {
  id: string;
  organization_id: string;
  student_id: string;
  tutor_user_id: string;
  created_by_user_id: string;
  subject: string | null;
  duration_minutes: number;
  recurrence_rule: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number;
  start_time_local: string;
  timezone: string;
  effective_from: string;
  effective_until: string | null;
  cancelled_at: string | null;
  notes_template: string | null;
  generated_through_date: string | null;
};

// Substitute {student_name} {date} {subject} placeholders in a notes template.
// Used by the cron + sessions/create flow when a template has notes_template
// configured. Anything that isn't a known placeholder is left untouched so
// users can use literal braces if they want.
export function applyNotesTemplate(
  template: string,
  vars: { studentName: string; dateIso: string; subject: string | null },
): string {
  return template
    .replace(/\{student_name\}/g, vars.studentName)
    .replace(/\{date\}/g, vars.dateIso)
    .replace(/\{subject\}/g, vars.subject ?? '');
}

// Return the list of local-date YYYY-MM-DD occurrences for a template over
// [fromDate, toDate]. Handles weekly/fortnightly/monthly.
export function computeOccurrences(
  template: SessionTemplate,
  fromDateIso: string,
  toDateIso: string,
): string[] {
  const occurrences: string[] = [];
  const start = maxIso(template.effective_from, fromDateIso);
  const end = template.effective_until
    ? minIso(template.effective_until, toDateIso)
    : toDateIso;
  if (start > end) return occurrences;

  // Seed to the first matching day-of-week on-or-after start.
  let cursor = nextWeekdayOnOrAfter(start, template.day_of_week, template.timezone);

  const step =
    template.recurrence_rule === 'weekly' ? 7 :
    template.recurrence_rule === 'fortnightly' ? 14 :
    /* monthly */ 28;

  while (cursor <= end) {
    occurrences.push(cursor);
    cursor = addDaysIso(cursor, step);
  }
  return occurrences;
}

// Generate + insert upcoming sessions for a single template. Returns the
// count inserted (duplicates are skipped silently).
export async function generateSessionsForTemplate(
  admin: SupabaseClient,
  template: SessionTemplate,
  opts: { horizonDays?: number; todayIso?: string } = {},
): Promise<number> {
  if (template.cancelled_at) return 0;
  const todayIso = opts.todayIso ?? localDateInTz(new Date(), template.timezone);
  const horizon = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const toDateIso = addDaysIso(todayIso, horizon);
  const occurrences = computeOccurrences(template, todayIso, toDateIso);
  if (occurrences.length === 0) return 0;

  // Convert occurrences to UTC scheduled_at ISO strings.
  const scheduledAtList = occurrences.map((date) => localDateTimeToUtcIso({
    dateIso: date,
    timeOfDay: template.start_time_local,
    timezone: template.timezone,
  }));

  // De-dupe against existing sessions for this template in the range.
  const { data: existing } = await admin
    .from('sessions')
    .select('scheduled_at')
    .eq('session_template_id', template.id)
    .gte('scheduled_at', scheduledAtList[0])
    .lte('scheduled_at', scheduledAtList[scheduledAtList.length - 1]);
  const existingSet = new Set(((existing ?? []) as Array<{ scheduled_at: string }>).map((r) => r.scheduled_at));

  // Resolve the student name once for notes_template substitution.
  let studentName = '';
  if (template.notes_template) {
    const { data: stu } = await admin
      .from('students').select('name').eq('id', template.student_id).maybeSingle();
    studentName = (stu?.name as string | undefined) ?? '';
  }

  const newPairs = scheduledAtList
    .map((iso, i) => ({ iso, dateIso: occurrences[i] }))
    .filter((p) => !existingSet.has(p.iso));

  const toInsert = newPairs.map(({ iso, dateIso }) => {
    const notes = template.notes_template
      ? applyNotesTemplate(template.notes_template, {
          studentName,
          dateIso,
          subject: template.subject,
        })
      : null;
    return {
      organization_id: template.organization_id,
      owner_id: template.created_by_user_id,
      student_id: template.student_id,
      tutor_user_id: template.tutor_user_id,
      session_template_id: template.id,
      subject: template.subject,
      scheduled_at: iso,
      duration_minutes: template.duration_minutes,
      status: 'scheduled',
      notes_internal: notes,
    };
  });

  if (toInsert.length > 0) {
    const { error } = await admin.from('sessions').insert(toInsert);
    if (error) {
      console.error('[sessionGeneration] insert failed', error);
      return 0;
    }
  }

  // Bump the generated_through_date watermark even if nothing new was
  // inserted (templates with no future occurrences still get marked so the
  // cron skips them next run).
  const lastDate = occurrences[occurrences.length - 1];
  if (lastDate && (!template.generated_through_date || lastDate > template.generated_through_date)) {
    await admin
      .from('session_templates')
      .update({ generated_through_date: lastDate })
      .eq('id', template.id);
  }

  return toInsert.length;
}

// Backfill every non-cancelled template for a given organization. Called
// from the tutor calendar page-load.
export async function backfillOrgTemplates(
  admin: SupabaseClient,
  organizationId: string,
  opts: { horizonDays?: number } = {},
): Promise<{ templates: number; sessions: number }> {
  const { data: templates } = await admin
    .from('session_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .is('cancelled_at', null);
  const list = (templates ?? []) as SessionTemplate[];
  let total = 0;
  for (const t of list) {
    total += await generateSessionsForTemplate(admin, t, opts);
  }
  return { templates: list.length, sessions: total };
}

// Cancel all future scheduled sessions belonging to a template. Used when
// the tutor ends/pauses a recurring template.
export async function cancelFutureSessionsForTemplate(
  admin: SupabaseClient,
  templateId: string,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('session_template_id', templateId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', nowIso)
    .select('id');
  if (error) {
    console.error('[sessionGeneration] cancel-future failed', error);
    return 0;
  }
  return data?.length ?? 0;
}

function maxIso(a: string, b: string): string { return a > b ? a : b; }
function minIso(a: string, b: string): string { return a < b ? a : b; }
