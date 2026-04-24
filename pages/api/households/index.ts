import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// GET /api/households — list households for the caller's org (with counts)
// POST /api/households — create a household, optionally with initial parent_id / student_ids
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
    const includeArchived = req.query.archived === 'true';
    let q = admin
      .from('households')
      .select('id, display_name, billing_email, notes, archived_at, created_at, updated_at')
      .eq('organization_id', membership.organization_id)
      .order('display_name', { ascending: true });
    if (!includeArchived) q = q.is('archived_at', null);
    const { data: households, error: hErr } = await q;
    if (hErr) return res.status(500).json({ error: hErr.message });

    const ids = (households ?? []).map((h) => h.id);
    if (ids.length === 0) return res.status(200).json({ households: [] });

    const [{ data: parents }, { data: students }] = await Promise.all([
      admin
        .from('household_parents')
        .select('household_id, is_primary, parent:parents!inner(id, name, email)')
        .in('household_id', ids),
      admin
        .from('students')
        .select('id, name, archived, household_id')
        .in('household_id', ids)
        .eq('archived', false),
    ]);

    const parentsByHousehold = new Map<string, any[]>();
    for (const row of (parents ?? []) as any[]) {
      const arr = parentsByHousehold.get(row.household_id) ?? [];
      arr.push({
        id: row.parent?.id,
        name: row.parent?.name ?? null,
        email: row.parent?.email ?? null,
        is_primary: !!row.is_primary,
      });
      parentsByHousehold.set(row.household_id, arr);
    }
    const studentsByHousehold = new Map<string, any[]>();
    for (const s of (students ?? []) as any[]) {
      const arr = studentsByHousehold.get(s.household_id) ?? [];
      arr.push({ id: s.id, name: s.name });
      studentsByHousehold.set(s.household_id, arr);
    }

    const enriched = (households ?? []).map((h: any) => {
      const ps = parentsByHousehold.get(h.id) ?? [];
      const ss = studentsByHousehold.get(h.id) ?? [];
      const primary = ps.find((p) => p.is_primary) ?? ps[0] ?? null;
      return {
        ...h,
        parents: ps,
        students: ss,
        primary_parent: primary,
        parent_count: ps.length,
        student_count: ss.length,
      };
    });

    return res.status(200).json({ households: enriched });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!displayName) return res.status(400).json({ error: 'display_name is required.' });
    const billingEmail = typeof body.billing_email === 'string' ? body.billing_email.trim() || null : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : null;
    const studentIds = Array.isArray(body.student_ids)
      ? (body.student_ids as unknown[]).filter((x) => typeof x === 'string') as string[]
      : [];

    const { data: household, error: insErr } = await admin
      .from('households')
      .insert({
        organization_id: membership.organization_id,
        display_name: displayName,
        billing_email: billingEmail,
        notes,
      })
      .select()
      .single();
    if (insErr || !household) return res.status(500).json({ error: insErr?.message ?? 'Create failed.' });

    if (parentId) {
      // Only accept parent IDs that are actually linked to a student in this org.
      const { data: valid } = await admin
        .from('parent_student_links')
        .select('parent_id, student:students!inner(organization_id)')
        .eq('parent_id', parentId)
        .is('revoked_at', null)
        .limit(1);
      const belongs = (valid ?? []).some((r: any) => r.student?.organization_id === membership.organization_id);
      if (belongs) {
        await admin
          .from('household_parents')
          .insert({ household_id: household.id, parent_id: parentId, is_primary: true });
      }
    }

    if (studentIds.length > 0) {
      await admin
        .from('students')
        .update({ household_id: household.id })
        .in('id', studentIds)
        .eq('organization_id', membership.organization_id);
    }

    return res.status(200).json({ household });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
