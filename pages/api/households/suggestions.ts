import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getMembershipForUser } from '../../../lib/membership';

// GET  /api/households/suggestions — find sibling groupings we could offer.
// POST /api/households/suggestions — body { suggestion_key, action: 'add_to_existing' | 'create_new' }
//      applies the suggestion.
//
// Detection: group students by shared parent. If two+ students share a
// parent but live in different households (or some/none in a household),
// that's a candidate grouping.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (req.method === 'GET') {
    const suggestions = await computeSuggestions(admin, membership.organization_id);
    return res.status(200).json({ suggestions });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = typeof body.suggestion_key === 'string' ? body.suggestion_key : '';
    const action = typeof body.action === 'string' ? body.action : '';
    if (!key || !action) return res.status(400).json({ error: 'suggestion_key and action required.' });

    const suggestions = await computeSuggestions(admin, membership.organization_id);
    const match = suggestions.find((s) => s.suggestion_key === key);
    if (!match) return res.status(404).json({ error: 'Suggestion no longer valid (it may have been applied).' });

    let householdId = match.suggested_household_id;
    if (action === 'create_new' || !householdId) {
      const displayName = deriveHouseholdName(match.parents[0]?.name ?? null);
      const { data: h, error: insErr } = await admin
        .from('households')
        .insert({
          organization_id: membership.organization_id,
          display_name: displayName,
        })
        .select().single();
      if (insErr || !h) return res.status(500).json({ error: insErr?.message ?? 'Create failed.' });
      householdId = h.id;
      // Attach primary parent.
      const primary = match.parents[0];
      if (primary) {
        await admin
          .from('household_parents')
          .insert({ household_id: householdId, parent_id: primary.id, is_primary: true });
      }
    }

    // Move every candidate student into the chosen household.
    const studentIds = match.students.map((s) => s.id);
    await admin
      .from('students')
      .update({ household_id: householdId })
      .in('id', studentIds)
      .eq('organization_id', membership.organization_id);

    return res.status(200).json({ ok: true, household_id: householdId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

type Suggestion = {
  suggestion_key: string;
  action: 'add_to_existing' | 'create_new';
  parents: Array<{ id: string; name: string | null; email: string | null }>;
  students: Array<{ id: string; name: string; current_household_id: string | null }>;
  suggested_household_id: string | null;
};

async function computeSuggestions(admin: any, organizationId: string): Promise<Suggestion[]> {
  // Pull every (parent, student) link for the org.
  const { data: students } = await admin
    .from('students')
    .select('id, name, household_id')
    .eq('organization_id', organizationId)
    .eq('archived', false);
  if (!students || students.length === 0) return [];
  const studentIds = students.map((s: any) => s.id);

  const { data: links } = await admin
    .from('parent_student_links')
    .select('parent_id, student_id, parent:parents!inner(id, name, email)')
    .in('student_id', studentIds)
    .is('revoked_at', null);

  // Group student_ids by parent_id.
  const studentsByParent = new Map<string, Array<{ id: string; name: string; household_id: string | null }>>();
  const parentInfo = new Map<string, { id: string; name: string | null; email: string | null }>();
  const studentById = new Map<string, { id: string; name: string; household_id: string | null }>();
  for (const s of students) studentById.set(s.id, s);

  for (const row of (links ?? []) as any[]) {
    const parentId = row.parent_id;
    const student = studentById.get(row.student_id);
    if (!student) continue;
    if (!studentsByParent.has(parentId)) studentsByParent.set(parentId, []);
    studentsByParent.get(parentId)!.push(student);
    parentInfo.set(parentId, {
      id: parentId,
      name: row.parent?.name ?? null,
      email: row.parent?.email ?? null,
    });
  }

  const suggestions: Suggestion[] = [];
  for (const [parentId, studs] of studentsByParent.entries()) {
    if (studs.length < 2) continue;
    // Dedupe students (the same student can appear once here; still guard).
    const seen = new Set<string>();
    const unique = studs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    const households = new Set(unique.map((s) => s.household_id).filter((x): x is string => !!x));
    const noHousehold = unique.some((s) => !s.household_id);
    const mixed = households.size > 1 || (households.size === 1 && noHousehold);
    const allNone = households.size === 0 && noHousehold;
    if (!mixed && !allNone) continue; // all already in the same household

    const suggested = households.size === 1 ? Array.from(households)[0] : null;
    const action: 'add_to_existing' | 'create_new' = suggested ? 'add_to_existing' : 'create_new';
    const parent = parentInfo.get(parentId);
    if (!parent) continue;

    const studentsSorted = unique
      .map((s) => ({ id: s.id, name: s.name, current_household_id: s.household_id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const keyRaw = [parentId, suggested ?? 'new', studentsSorted.map((s) => s.id).join(',')].join('|');
    const key = createHash('sha1').update(keyRaw).digest('hex').slice(0, 16);
    suggestions.push({
      suggestion_key: key,
      action,
      parents: [parent],
      students: studentsSorted,
      suggested_household_id: suggested,
    });
  }
  return suggestions;
}

function deriveHouseholdName(parentName: string | null): string {
  if (!parentName) return 'Household';
  const trimmed = parentName.trim();
  if (!trimmed) return 'Household';
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed;
  return `${parts[parts.length - 1]} family`;
}
