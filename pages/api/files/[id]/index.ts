// GET /api/files/[id]      — file detail (+view analytics for uploader/owner)
// PATCH /api/files/[id]    — rename (display_name) or move (student_id)
// DELETE /api/files/[id]   — soft delete (sets deleted_at), uploader or owner

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationIdForUser } from '../../../../lib/organization';
import { getMembershipForUser } from '../../../../lib/membership';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const fileId = String(req.query.id ?? '');
  if (!fileId) return res.status(400).json({ error: 'file id required.' });

  const orgId = await getOrganizationIdForUser(userClient, userId);
  if (!orgId) return res.status(403).json({ error: 'No organization for this account.' });
  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'Not a member of this org.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: file } = await admin
    .from('files')
    .select('*')
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return res.status(404).json({ error: 'File not found.' });
  if (file.organization_id !== orgId) return res.status(404).json({ error: 'File not found.' });
  if (file.deleted_at) return res.status(404).json({ error: 'File not found.' });

  const isOwner = membership.role === 'owner';
  const isUploader = file.uploaded_by_user_id === userId;
  const canModify = isOwner || isUploader;
  const canSeeAnalytics = canModify;

  if (req.method === 'GET') {
    let viewers: any[] = [];
    let viewCount = 0;
    if (canSeeAnalytics) {
      const { data: vs } = await admin
        .from('file_views')
        .select('id, viewer_user_id, viewer_role, viewed_at')
        .eq('file_id', fileId)
        .order('viewed_at', { ascending: false })
        .limit(200);
      viewers = vs ?? [];
      viewCount = viewers.length;
      // Resolve viewer email/name for display.
      const ids = Array.from(new Set(viewers.map((v) => v.viewer_user_id))).filter(Boolean);
      if (ids.length > 0) {
        const { data: parents } = await admin
          .from('parents')
          .select('auth_user_id, email, name')
          .in('auth_user_id', ids);
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, email, owner_name')
          .in('id', ids);
        const byId = new Map<string, { email: string | null; name: string | null }>();
        for (const p of profiles ?? []) {
          byId.set(p.id, { email: p.email ?? null, name: p.owner_name ?? null });
        }
        for (const p of parents ?? []) {
          if (!byId.has(p.auth_user_id)) {
            byId.set(p.auth_user_id, { email: p.email ?? null, name: p.name ?? null });
          }
        }
        viewers = viewers.map((v) => ({ ...v, viewer_email: byId.get(v.viewer_user_id)?.email ?? null, viewer_name: byId.get(v.viewer_user_id)?.name ?? null }));
      }
    } else {
      const { count } = await admin
        .from('file_views')
        .select('id', { head: true, count: 'exact' })
        .eq('file_id', fileId);
      viewCount = count ?? 0;
    }
    return res.status(200).json({ file, view_count: viewCount, viewers: canSeeAnalytics ? viewers : [] });
  }

  if (req.method === 'PATCH') {
    if (!canModify) return res.status(403).json({ error: 'Only the uploader or org owner can edit.' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') {
      const trimmed = body.display_name.trim();
      if (!trimmed || trimmed.length > 200) {
        return res.status(400).json({ error: 'display_name must be 1-200 chars.' });
      }
      update.display_name = trimmed;
    }
    if ('student_id' in body) {
      // Owners can move files between students. Tutors cannot reassign.
      if (!isOwner) return res.status(403).json({ error: 'Only owners can move files between students.' });
      const newStudentId = body.student_id;
      if (newStudentId === null) {
        return res.status(400).json({ error: 'Cannot null out student_id via PATCH. Use is_org_library if applicable.' });
      }
      if (typeof newStudentId !== 'string') {
        return res.status(400).json({ error: 'student_id must be a uuid string.' });
      }
      const { data: student } = await admin
        .from('students')
        .select('id, organization_id')
        .eq('id', newStudentId)
        .maybeSingle();
      if (!student || student.organization_id !== orgId) {
        return res.status(404).json({ error: 'Target student not found.' });
      }
      if (file.is_org_library) {
        return res.status(400).json({ error: 'Cannot move an org-library file to a student. Create a new copy.' });
      }
      update.student_id = newStudentId;
      update.session_id = null; // clear stale session linkage on move
    }
    if ('allow_printing' in body) {
      if (typeof body.allow_printing !== 'boolean') {
        return res.status(400).json({ error: 'allow_printing must be boolean.' });
      }
      update.allow_printing = body.allow_printing;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }
    const { data: updated, error: updateErr } = await admin
      .from('files')
      .update(update)
      .eq('id', fileId)
      .select('*')
      .single();
    if (updateErr || !updated) {
      console.error('[files/[id]] patch failed', updateErr);
      return res.status(500).json({ error: 'Could not update file.' });
    }
    return res.status(200).json({ file: updated });
  }

  if (req.method === 'DELETE') {
    if (!canModify) return res.status(403).json({ error: 'Only the uploader or org owner can delete.' });
    const { error: deleteErr } = await admin
      .from('files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fileId)
      .is('deleted_at', null);
    if (deleteErr) {
      console.error('[files/[id]] delete failed', deleteErr);
      return res.status(500).json({ error: 'Could not delete file.' });
    }
    // Best-effort: also remove the storage object so the bytes free up
    // outside the DB counter (org cap stays in sync via the trigger).
    await admin.storage.from('files').remove([file.storage_path]).catch(() => undefined);
    if (file.converted_pdf_path) {
      await admin.storage.from('files').remove([file.converted_pdf_path]).catch(() => undefined);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
