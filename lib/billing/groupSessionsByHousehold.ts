import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnbilledSession } from './unbilledSessions';

export type HouseholdGroupStudent = {
  student_id: string;
  student_name: string;
  hourly_rate_cents: number | null;
  sessions: UnbilledSession[];
  session_count: number;
  subtotal_cents: number;
};

export type HouseholdGroup = {
  household_id: string | null;
  household_display_name: string;
  primary_parent: { id: string; name: string | null; email: string | null } | null;
  students: HouseholdGroupStudent[];
  total_cents: number;
  session_count: number;
  is_ungrouped: boolean; // synthetic bucket for students with no household_id
};

// Enrich sessions with household metadata and group them for UI / API use.
// Students with NO household_id fall into a synthetic "Ungrouped" bucket so
// the tutor can still see them but isn't tricked into batching them.
export async function groupSessionsByHousehold(
  admin: SupabaseClient,
  sessions: UnbilledSession[],
): Promise<HouseholdGroup[]> {
  if (sessions.length === 0) return [];

  const householdIds = Array.from(
    new Set(sessions.map((s) => s.household_id).filter((x): x is string => !!x)),
  );

  // Resolve household display name + primary parent per household.
  const householdMeta = new Map<string, {
    display_name: string;
    primary_parent: HouseholdGroup['primary_parent'];
  }>();
  if (householdIds.length > 0) {
    const { data: households } = await admin
      .from('households')
      .select('id, display_name')
      .in('id', householdIds);
    for (const h of (households ?? []) as any[]) {
      householdMeta.set(h.id, { display_name: h.display_name, primary_parent: null });
    }
    // Primary parent row per household (if any).
    const { data: hps } = await admin
      .from('household_parents')
      .select('household_id, is_primary, parent:parents!inner(id, name, email)')
      .in('household_id', householdIds)
      .order('is_primary', { ascending: false });
    for (const row of (hps ?? []) as any[]) {
      const meta = householdMeta.get(row.household_id);
      if (!meta) continue;
      // First row per household (ordered primary-first) wins as the "primary" contact.
      if (!meta.primary_parent) {
        meta.primary_parent = {
          id: row.parent?.id,
          name: row.parent?.name ?? null,
          email: row.parent?.email ?? null,
        };
      }
    }
  }

  // Bucket sessions by (household_id || 'ungrouped') → (student_id → UnbilledSession[]).
  const byHousehold = new Map<string, Map<string, HouseholdGroupStudent>>();
  for (const s of sessions) {
    const hk = s.household_id ?? '__ungrouped__';
    if (!byHousehold.has(hk)) byHousehold.set(hk, new Map());
    const studentMap = byHousehold.get(hk)!;
    if (!studentMap.has(s.student_id)) {
      studentMap.set(s.student_id, {
        student_id: s.student_id,
        student_name: s.student_name,
        hourly_rate_cents: s.student_hourly_rate_cents,
        sessions: [],
        session_count: 0,
        subtotal_cents: 0,
      });
    }
    const st = studentMap.get(s.student_id)!;
    st.sessions.push(s);
    st.session_count += 1;
    st.subtotal_cents += s.amount_cents;
  }

  const groups: HouseholdGroup[] = [];
  for (const [hk, studentMap] of byHousehold.entries()) {
    const isUngrouped = hk === '__ungrouped__';
    const meta = isUngrouped ? null : householdMeta.get(hk);
    const students = Array.from(studentMap.values())
      .sort((a, b) => a.student_name.localeCompare(b.student_name));
    const total_cents = students.reduce((a, s) => a + s.subtotal_cents, 0);
    const session_count = students.reduce((a, s) => a + s.session_count, 0);
    groups.push({
      household_id: isUngrouped ? null : hk,
      household_display_name: isUngrouped ? 'Ungrouped students' : meta?.display_name ?? 'Household',
      primary_parent: meta?.primary_parent ?? null,
      students,
      total_cents,
      session_count,
      is_ungrouped: isUngrouped,
    });
  }
  // Ungrouped always last.
  groups.sort((a, b) => {
    if (a.is_ungrouped && !b.is_ungrouped) return 1;
    if (!a.is_ungrouped && b.is_ungrouped) return -1;
    return a.household_display_name.localeCompare(b.household_display_name);
  });
  return groups;
}

// Helpful presets for UI period pickers. All times computed in local (browser)
// time. When the API consumes these, pass ISO strings; UTC conversion is fine.
export function periodPreset(kind: 'this_week' | 'last_week' | 'this_month' | 'last_month'): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (kind === 'this_week' || kind === 'last_week') {
    const dow = now.getDay(); // 0=Sun..6=Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    const start = new Date(monday);
    if (kind === 'last_week') start.setDate(start.getDate() - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }
  if (kind === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end };
}
