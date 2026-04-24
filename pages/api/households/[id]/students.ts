import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// POST /api/households/[id]/students — body { student_id, link_parents?: boolean }
//   Move student into this household. If link_parents is true, also INSERT
//   parent_student_links rows linking each household parent to the new student.
// DELETE /api/households/[id]/students — body { student_id } → set household_id = null
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
  const studentId = typeof body.student_id === 'string' ? body.student_id : null;
  if (!studentId) return res.status(400).json({ error: 'student_id required.' });

  const { data: student } = await admin
    .from('students')
    .select('id, organization_id, household_id')
    .eq('id', studentId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  if (req.method === 'POST') {
    if (student.household_id && student.household_id !== id && body.force !== true) {
      return res.status(409).json({
        error: 'Student is already in another household. Pass force=true to move.',
      });
    }
    const { error: upErr } = await admin
      .from('students').update({ household_id: id }).eq('id', studentId);
    if (upErr) return res.status(500).json({ error: upErr.message });

    if (body.link_parents === true) {
      const { data: hps } = await admin
        .from('household_parents').select('parent_id').eq('household_id', id);
      const parentIds = (hps ?? []).map((p: any) => p.parent_id);
      if (parentIds.length > 0) {
        // Check existing links to avoid duplicate-insert errors.
        const { data: existing } = await admin
          .from('parent_student_links')
          .select('parent_id')
          .eq('student_id', studentId)
          .in('parent_id', parentIds);
        const existingSet = new Set((existing ?? []).map((r: any) => r.parent_id));
        const toInsert = parentIds
          .filter((pid) => !existingSet.has(pid))
          .map((pid) => ({
            parent_id: pid,
            student_id: studentId,
            tutor_user_id: membership.user_id,
          }));
        if (toInsert.length > 0) {
          await admin.from('parent_student_links').insert(toInsert);
        }
      }
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (student.household_id !== id) {
      return res.status(400).json({ error: 'Student is not in this household.' });
    }
    const { error } = await admin
      .from('students').update({ household_id: null }).eq('id', studentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
