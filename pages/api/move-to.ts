import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAudit, writeAuditBatch } from '../../lib/audit';

// POST /api/move-to
// Body: { entity_type: 'student' | 'session', entity_ids: string[],
//         new_tutor_user_id: string, future_only?: boolean }
//
// Owner-only.  For students: changes primary_tutor_id and (when future_only is
// true, the default for bulk reassignments) reassigns only future scheduled
// sessions.  Past sessions stay attributed to the original tutor.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can move records between tutors.' });
  }

  const body = (req.body ?? {}) as {
    entity_type?: 'student' | 'session';
    entity_ids?: string[];
    new_tutor_user_id?: string;
    future_only?: boolean;
  };
  const ids = (body.entity_ids ?? []).filter((id) => typeof id === 'string');
  if (!body.entity_type || !body.new_tutor_user_id || ids.length === 0) {
    return res.status(400).json({ error: 'entity_type, entity_ids and new_tutor_user_id required.' });
  }
  const futureOnly = body.future_only !== false;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Verify the destination tutor is in this org.
  const { data: destMember } = await admin
    .from('organization_members')
    .select('user_id, role, organization_id')
    .eq('user_id', body.new_tutor_user_id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!destMember) return res.status(400).json({ error: 'Destination tutor is not in your organization.' });

  // Resolve their tutors.id (linked via tutors.auth_user_id).
  const { data: destTutor } = await admin
    .from('tutors')
    .select('id, name')
    .eq('auth_user_id', body.new_tutor_user_id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();

  if (body.entity_type === 'student') {
    const { data: rows } = await admin
      .from('students')
      .select('id, name, organization_id')
      .in('id', ids);
    const visible = (rows ?? []).filter((r: any) => r.organization_id === membership.organization_id);
    if (visible.length === 0) return res.status(404).json({ error: 'Nothing to move.' });
    const visibleIds = visible.map((r: any) => r.id);

    const { error: updErr } = await admin
      .from('students')
      .update({ primary_tutor_id: destTutor?.id ?? null })
      .in('id', visibleIds);
    if (updErr) return res.status(500).json({ error: updErr.message });

    if (futureOnly) {
      const now = new Date().toISOString();
      await admin
        .from('sessions')
        .update({ tutor_user_id: body.new_tutor_user_id, tutor_id: destTutor?.id ?? null })
        .in('student_id', visibleIds)
        .gte('scheduled_at', now)
        .neq('status', 'completed');
    }

    await writeAuditBatch(
      admin,
      visible.map((r: any) => ({
        organizationId: membership.organization_id,
        actorUserId: userId,
        actorRole: membership.role,
        action: 'student.moved',
        entityType: 'student',
        entityId: r.id,
        payload: {
          entity_name: r.name,
          new_tutor: destTutor?.name ?? body.new_tutor_user_id,
          future_only: futureOnly,
        },
      })),
    );

    return res.status(200).json({ ok: true, moved: visibleIds.length });
  }

  // Session move.
  const { data: rows } = await admin
    .from('sessions')
    .select('id, organization_id, scheduled_at, status')
    .in('id', ids);
  const visible = (rows ?? []).filter((r: any) =>
    r.organization_id === membership.organization_id && r.status !== 'completed'
  );
  if (visible.length === 0) return res.status(404).json({ error: 'Nothing to move (completed sessions can\'t be reassigned).' });
  const visibleIds = visible.map((r: any) => r.id);

  const { error: updErr } = await admin
    .from('sessions')
    .update({ tutor_user_id: body.new_tutor_user_id, tutor_id: destTutor?.id ?? null })
    .in('id', visibleIds);
  if (updErr) return res.status(500).json({ error: updErr.message });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'session.moved',
    payload: { count: visibleIds.length, new_tutor: destTutor?.name ?? body.new_tutor_user_id },
  });

  return res.status(200).json({ ok: true, moved: visibleIds.length });
}
