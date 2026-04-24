import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// POST /api/households/[id]/parents — body { parent_id, is_primary? } — add existing parent
//                                      body { name, email, is_primary?, send_invite? } — create new parent + add
// DELETE /api/households/[id]/parents — body { parent_id }
// PATCH /api/households/[id]/parents — body { parent_id, set_primary: true }
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

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: household } = await admin
    .from('households').select('id, organization_id')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!household) return res.status(404).json({ error: 'Household not found.' });

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (req.method === 'POST') {
    let parentId = typeof body.parent_id === 'string' ? body.parent_id : null;
    const wantPrimary = body.is_primary === true;

    if (!parentId) {
      // No way to create a fresh parent record without a student link (parents
      // must belong to a student via parent_student_links). Reject for now —
      // the UI should only offer "pick existing parent" or route through the
      // parent-invitation flow. Flagged as a followup.
      return res.status(400).json({
        error: 'parent_id required. Use the parent invitation flow to create a new parent account.',
      });
    }

    // Verify parent exists and is linked to at least one student in this org.
    const { data: links } = await admin
      .from('parent_student_links')
      .select('parent_id, student:students!inner(organization_id)')
      .eq('parent_id', parentId)
      .is('revoked_at', null)
      .limit(5);
    const belongs = (links ?? []).some((r: any) => r.student?.organization_id === membership.organization_id);
    if (!belongs) return res.status(403).json({ error: 'Parent is not linked to your organization.' });

    // If parent is already in this household, 200 with is_primary toggle if requested.
    const { data: existing } = await admin
      .from('household_parents')
      .select('id, is_primary')
      .eq('household_id', id)
      .eq('parent_id', parentId)
      .maybeSingle();
    if (existing) {
      if (wantPrimary && !existing.is_primary) {
        await promotePrimary(admin, id, parentId);
      }
      return res.status(200).json({ ok: true, already: true });
    }

    if (wantPrimary) {
      // Demote any existing primary before inserting as primary.
      await admin.from('household_parents')
        .update({ is_primary: false })
        .eq('household_id', id)
        .eq('is_primary', true);
    }

    const { error: insErr } = await admin
      .from('household_parents')
      .insert({ household_id: id, parent_id: parentId, is_primary: wantPrimary });
    if (insErr) return res.status(500).json({ error: insErr.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : null;
    if (!parentId) return res.status(400).json({ error: 'parent_id required.' });

    const { data: row } = await admin
      .from('household_parents')
      .select('id, is_primary')
      .eq('household_id', id)
      .eq('parent_id', parentId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Parent is not in this household.' });

    const { error: delErr } = await admin
      .from('household_parents')
      .delete()
      .eq('id', row.id);
    if (delErr) return res.status(500).json({ error: delErr.message });

    // If we removed the primary, promote another parent (first by added_at) to primary.
    if (row.is_primary) {
      const { data: next } = await admin
        .from('household_parents')
        .select('id')
        .eq('household_id', id)
        .order('added_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await admin.from('household_parents').update({ is_primary: true }).eq('id', next.id);
      }
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : null;
    if (!parentId) return res.status(400).json({ error: 'parent_id required.' });
    if (body.set_primary !== true) return res.status(400).json({ error: 'Nothing to update.' });
    await promotePrimary(admin, id, parentId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function promotePrimary(admin: any, householdId: string, parentId: string) {
  await admin.from('household_parents')
    .update({ is_primary: false })
    .eq('household_id', householdId)
    .eq('is_primary', true);
  await admin.from('household_parents')
    .update({ is_primary: true })
    .eq('household_id', householdId)
    .eq('parent_id', parentId);
}
