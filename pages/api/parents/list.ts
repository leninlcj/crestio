import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// GET /api/parents/list
// Returns every distinct parent in the caller's organization, with derived
// household + student data + invitation state. Replaces the older client-side
// query that filtered through parent_student_links only — that missed parents
// added through the household flow.

type ParentRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  household_names: string[];
  household_ids: string[];
  student_names: string[];
  student_ids: string[];
  invited: boolean;
  accepted: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  const orgId = membership.organization_id;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1. Anchor on parents that already carry organization_id (post-migration).
  //    Anything missing organization_id gets backfilled from the join tables
  //    below, so legacy rows still surface during the rollout window.
  const [
    parentsByOrgRes,
    householdParentsRes,
    parentStudentLinksRes,
    invitationsRes,
  ] = await Promise.all([
    admin
      .from('parents')
      .select('id, name, email, created_at, organization_id, archived_at')
      .eq('organization_id', orgId)
      .is('archived_at', null),
    admin
      .from('household_parents')
      .select('parent_id, household:households!inner(id, display_name, organization_id, archived_at)')
      .order('added_at', { ascending: true }),
    admin
      .from('parent_student_links')
      .select('parent_id, student:students!inner(id, name, organization_id, archived_at, parent_phone, household_id)')
      .is('revoked_at', null),
    admin
      .from('parent_invitations')
      .select('email, accepted_at, organization_id'),
  ]);

  const allParents = new Map<string, ParentRow>();
  const seedParent = (p: any) => {
    if (!p?.id) return;
    if (allParents.has(p.id)) return;
    allParents.set(p.id, {
      id: p.id,
      name: p.name ?? null,
      email: p.email ?? '',
      phone: null,
      created_at: p.created_at ?? new Date().toISOString(),
      household_names: [],
      household_ids: [],
      student_names: [],
      student_ids: [],
      invited: false,
      accepted: false,
    });
  };
  for (const p of (parentsByOrgRes.data ?? []) as any[]) seedParent(p);

  // 2. Fold in household_parents — pulls in any parent linked to a household
  //    that belongs to this org, even if parents.organization_id wasn't
  //    backfilled yet.
  const householdParents = ((householdParentsRes.data ?? []) as any[])
    .filter((hp) => hp.household?.organization_id === orgId && !hp.household?.archived_at);
  const missingParentIds = new Set<string>();
  for (const hp of householdParents) {
    if (hp.parent_id && !allParents.has(hp.parent_id)) {
      missingParentIds.add(hp.parent_id);
    }
  }
  if (missingParentIds.size > 0) {
    const { data: extra } = await admin
      .from('parents')
      .select('id, name, email, created_at, archived_at')
      .in('id', Array.from(missingParentIds))
      .is('archived_at', null);
    for (const p of (extra ?? []) as any[]) seedParent(p);
  }

  // 3. Fold in legacy parent_student_links the same way — backstop for any
  //    parent that exists with neither organization_id nor a household yet.
  const parentStudentLinks = ((parentStudentLinksRes.data ?? []) as any[])
    .filter((l) => l.student?.organization_id === orgId && !l.student?.archived_at);
  const stillMissing = new Set<string>();
  for (const l of parentStudentLinks) {
    if (l.parent_id && !allParents.has(l.parent_id)) stillMissing.add(l.parent_id);
  }
  if (stillMissing.size > 0) {
    const { data: extra } = await admin
      .from('parents')
      .select('id, name, email, created_at, archived_at')
      .in('id', Array.from(stillMissing))
      .is('archived_at', null);
    for (const p of (extra ?? []) as any[]) seedParent(p);
  }

  // 4. Apply household + student enrichment.
  for (const hp of householdParents) {
    const row = allParents.get(hp.parent_id);
    if (!row) continue;
    if (hp.household?.id && !row.household_ids.includes(hp.household.id)) {
      row.household_ids.push(hp.household.id);
      row.household_names.push(hp.household.display_name ?? 'Household');
    }
  }
  for (const l of parentStudentLinks) {
    const row = allParents.get(l.parent_id);
    if (!row || !l.student?.id) continue;
    if (!row.student_ids.includes(l.student.id)) {
      row.student_ids.push(l.student.id);
      row.student_names.push(l.student.name ?? 'Student');
    }
    if (!row.phone && l.student.parent_phone) row.phone = l.student.parent_phone;
  }

  // 5. Resolve students through the household route too — anyone in a
  //    household that the parent belongs to counts as one of the parent's
  //    students for display purposes.
  const householdIdsAll = Array.from(new Set(
    Array.from(allParents.values()).flatMap((p) => p.household_ids),
  ));
  if (householdIdsAll.length > 0) {
    const { data: householdStudents } = await admin
      .from('students')
      .select('id, name, household_id, parent_phone, archived_at')
      .in('household_id', householdIdsAll)
      .is('archived_at', null);
    const studentsByHousehold = new Map<string, any[]>();
    for (const s of (householdStudents ?? []) as any[]) {
      if (!studentsByHousehold.has(s.household_id)) studentsByHousehold.set(s.household_id, []);
      studentsByHousehold.get(s.household_id)!.push(s);
    }
    for (const row of allParents.values()) {
      for (const hid of row.household_ids) {
        for (const s of studentsByHousehold.get(hid) ?? []) {
          if (!row.student_ids.includes(s.id)) {
            row.student_ids.push(s.id);
            row.student_names.push(s.name ?? 'Student');
          }
          if (!row.phone && s.parent_phone) row.phone = s.parent_phone;
        }
      }
    }
  }

  // 6. Invitation state by email (best-effort scoped to org).
  for (const inv of (invitationsRes.data ?? []) as any[]) {
    if (inv.organization_id && inv.organization_id !== orgId) continue;
    for (const row of allParents.values()) {
      if (row.email && inv.email && row.email.toLowerCase() === inv.email.toLowerCase()) {
        row.invited = true;
        if (inv.accepted_at) row.accepted = true;
      }
    }
  }
  // Anyone who has an auth_user_id has accepted by definition. We don't have
  // that here without another query, but a parent record existing inside an
  // org with no invitation row almost always means they self-accepted.
  for (const row of allParents.values()) {
    if (!row.invited && row.email) row.accepted = true;
  }

  const list = Array.from(allParents.values()).sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  return res.status(200).json({ parents: list });
}
