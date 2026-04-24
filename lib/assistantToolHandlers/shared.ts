import type { SupabaseClient } from '@supabase/supabase-js';
import type { Membership } from '../membership';

export type ToolCallerContext = {
  client: SupabaseClient;
  membership: Membership;
};

export type ToolFailure = { kind: 'failure'; message: string };
export type ToolSuccess<T> = { kind: 'success'; value: T };
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Name formatting
// ---------------------------------------------------------------------------

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Currency formatting (for preview narratives in server-side messages)
// ---------------------------------------------------------------------------

export function formatCentsAud(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: (cents % 100 === 0) ? 0 : 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Dates — Australia/Sydney bias
// ---------------------------------------------------------------------------

export function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAuDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatAuDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

// ---------------------------------------------------------------------------
// Student fuzzy resolution
// ---------------------------------------------------------------------------

export type StudentLite = {
  id: string;
  name: string;
  year_level: string | null;
  subjects: string[] | null;
  hourly_rate_cents: number | null;
  parent_name: string | null;
  parent_email: string | null;
  primary_tutor_id: string | null;
  archived: boolean;
};

function studentSelectColumns(): string {
  return 'id, name, year_level, subjects, hourly_rate_cents, parent_name, parent_email, primary_tutor_id, archived';
}

export type ResolveStudentResult =
  | { kind: 'one'; student: StudentLite }
  | { kind: 'many'; students: StudentLite[] }
  | { kind: 'none'; suggestions: string[] };

export async function resolveStudent(
  ctx: ToolCallerContext,
  nameOrId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ResolveStudentResult> {
  const { client, membership } = ctx;
  const raw = (nameOrId ?? '').trim();
  if (!raw) return { kind: 'none', suggestions: [] };

  // UUID lookup is exact.
  if (UUID_RE.test(raw)) {
    let q = client
      .from('students')
      .select(studentSelectColumns())
      .eq('organization_id', membership.organization_id)
      .eq('id', raw);
    if (!opts.includeArchived) q = q.eq('archived', false);
    if (membership.role === 'tutor' && membership.tutor_id) {
      q = q.eq('primary_tutor_id', membership.tutor_id);
    }
    const { data } = await q.maybeSingle();
    if (data) return { kind: 'one', student: data as unknown as StudentLite };
    return { kind: 'none', suggestions: [] };
  }

  // Fuzzy name match.
  let q = client
    .from('students')
    .select(studentSelectColumns())
    .eq('organization_id', membership.organization_id)
    .ilike('name', `%${raw}%`);
  if (!opts.includeArchived) q = q.eq('archived', false);
  if (membership.role === 'tutor' && membership.tutor_id) {
    q = q.eq('primary_tutor_id', membership.tutor_id);
  }
  const { data } = await q;
  const list = (data ?? []) as unknown as StudentLite[];
  if (list.length === 1) return { kind: 'one', student: list[0] };
  if (list.length > 1) return { kind: 'many', students: list };

  // No matches — gather up to 5 names for suggestions.
  let listQ = client
    .from('students')
    .select('name')
    .eq('organization_id', membership.organization_id)
    .limit(5);
  if (!opts.includeArchived) listQ = listQ.eq('archived', false);
  if (membership.role === 'tutor' && membership.tutor_id) {
    listQ = listQ.eq('primary_tutor_id', membership.tutor_id);
  }
  const { data: any5 } = await listQ;
  const suggestions = (any5 ?? []).map((s: any) => s.name).filter(Boolean);
  return { kind: 'none', suggestions };
}

// ---------------------------------------------------------------------------
// Tutor fuzzy resolution (by name or email)
// ---------------------------------------------------------------------------

export type TutorLite = {
  id: string;
  name: string;
  email: string | null;
  auth_user_id: string | null;
  archived: boolean;
};

export type ResolveTutorResult =
  | { kind: 'one'; tutor: TutorLite }
  | { kind: 'many'; tutors: TutorLite[] }
  | { kind: 'none' };

export async function resolveTutor(
  ctx: ToolCallerContext,
  nameOrEmail: string,
): Promise<ResolveTutorResult> {
  const { client, membership } = ctx;
  const raw = (nameOrEmail ?? '').trim();
  if (!raw) return { kind: 'none' };

  let q = client
    .from('tutors')
    .select('id, name, email, auth_user_id, archived')
    .eq('organization_id', membership.organization_id)
    .eq('archived', false);

  if (raw.includes('@')) {
    q = q.ilike('email', raw);
  } else {
    q = q.ilike('name', `%${raw}%`);
  }

  const { data } = await q;
  const list = (data ?? []) as TutorLite[];
  if (list.length === 1) return { kind: 'one', tutor: list[0] };
  if (list.length > 1) return { kind: 'many', tutors: list };
  return { kind: 'none' };
}
