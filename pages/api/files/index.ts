// GET /api/files — list files for the current user's scope.
//
// Query params:
//   • student_id      — filter to a specific student
//   • session_id      — filter to a specific session
//   • is_org_library  — '1' / 'true' to fetch org library (Team only)
//   • search          — case-insensitive ilike on display_name (Team only)
//   • limit / offset  — pagination, default 50/0, max limit 100
//
// Tutors see their assigned students' files plus the org library; owners see
// everything. Parents are not allowed here — they fetch via the parent
// portal's existing student detail page using PostgREST + RLS.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationIdForUser } from '../../../lib/organization';
import { getMembershipForUser } from '../../../lib/membership';
import { getPlanLimits } from '../../../lib/files';
import type { PlanTier } from '../../../lib/billing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const orgId = await getOrganizationIdForUser(userClient, userId);
  if (!orgId) return res.status(403).json({ error: 'No organization for this account.' });
  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'Not a member of this org.' });

  const studentId = typeof req.query.student_id === 'string' && req.query.student_id ? req.query.student_id : null;
  const sessionId = typeof req.query.session_id === 'string' && req.query.session_id ? req.query.session_id : null;
  const isOrgLibrary = req.query.is_org_library === '1' || req.query.is_org_library === 'true';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: org } = await admin
    .from('organizations').select('plan_tier').eq('id', orgId).maybeSingle();
  const planTier = (org?.plan_tier ?? 'solo') as PlanTier;
  const limits = getPlanLimits(planTier);

  if (isOrgLibrary && !limits.orgLibrary) {
    return res.status(403).json({ error: 'Org library is a Team feature.' });
  }
  if (search && !limits.search) {
    return res.status(403).json({ error: 'Search is a Team feature.' });
  }

  let q = admin
    .from('files')
    .select('id, organization_id, uploaded_by_user_id, student_id, session_id, original_filename, display_name, mime_type, file_size_bytes, is_org_library, status, created_at, updated_at', { count: 'exact' })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (isOrgLibrary) {
    q = q.eq('is_org_library', true);
  } else if (studentId) {
    q = q.eq('student_id', studentId).eq('is_org_library', false);
  } else {
    q = q.eq('is_org_library', false);
  }

  if (sessionId) q = q.eq('session_id', sessionId);
  if (search) q = q.ilike('display_name', `%${search.replace(/[%_]/g, '\\$&')}%`);

  // Tutor scope: only files for students assigned to them, plus the org library.
  if (membership.role === 'tutor') {
    if (!isOrgLibrary) {
      const { data: myStudents } = await admin
        .from('students')
        .select('id')
        .eq('organization_id', orgId)
        .eq('primary_tutor_id', membership.tutor_id ?? '00000000-0000-0000-0000-000000000000');
      const ids = (myStudents ?? []).map((s) => s.id);
      if (ids.length === 0) {
        return res.status(200).json({ files: [], total: 0, limit, offset });
      }
      if (studentId && !ids.includes(studentId)) {
        return res.status(403).json({ error: 'You do not have access to this student.' });
      }
      q = q.in('student_id', ids);
    }
  }

  const { data: rows, count, error: listErr } = await q;
  if (listErr) {
    console.error('[files/index] list failed', listErr);
    return res.status(500).json({ error: 'Could not list files.' });
  }

  // View counts in one round trip via aggregated SQL.
  const fileIds = (rows ?? []).map((r) => r.id);
  let viewCounts: Record<string, { count: number; last_at: string | null }> = {};
  if (fileIds.length > 0) {
    const { data: views } = await admin
      .from('file_views')
      .select('file_id, viewed_at')
      .in('file_id', fileIds);
    for (const v of views ?? []) {
      const fid = v.file_id as string;
      const at = v.viewed_at as string;
      const cur = viewCounts[fid] ?? { count: 0, last_at: null };
      cur.count += 1;
      if (!cur.last_at || cur.last_at < at) cur.last_at = at;
      viewCounts[fid] = cur;
    }
  }

  return res.status(200).json({
    files: (rows ?? []).map((r) => ({
      ...r,
      view_count: viewCounts[r.id]?.count ?? 0,
      last_viewed_at: viewCounts[r.id]?.last_at ?? null,
    })),
    total: count ?? rows?.length ?? 0,
    limit,
    offset,
  });
}
