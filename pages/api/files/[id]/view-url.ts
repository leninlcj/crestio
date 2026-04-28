// GET /api/files/[id]/view-url — issue a 60s signed download URL.
//
// Authenticated. Authorizes the caller via:
//   • org member (owner or tutor) with access to this file's student, OR
//   • parent linked (non-revoked) to the file's student.
//
// Inserts a file_views audit row server-side so the timeline is the source of
// truth. Returns watermark_text only on Team — UI overlays it on the viewer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, LIMITS } from '../../../../lib/rateLimit';
import { watermarkFor, deriveViewerRole } from '../../../../lib/files';
import type { PlanTier } from '../../../../lib/billing';

const SIGNED_DOWNLOAD_TTL = 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const rl = checkRateLimit({
    key: `files_view_url:${userId}`,
    limit: LIMITS.files_view_url.limit,
    windowMs: LIMITS.files_view_url.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const fileId = String(req.query.id ?? '');
  if (!fileId) return res.status(400).json({ error: 'file id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: file } = await admin
    .from('files')
    .select('id, organization_id, student_id, intended_student_id, is_org_library, storage_path, converted_pdf_path, mime_type, status, deleted_at, allow_printing, display_name, uploaded_by_user_id')
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return res.status(404).json({ error: 'File not found.' });
  if (file.deleted_at) return res.status(404).json({ error: 'File not found.' });
  if (file.status !== 'ready') {
    return res.status(409).json({ error: `File is not ready (status=${file.status}).` });
  }

  // Authorize: org member (owner/tutor) OR linked parent OR intended student.
  let viewerRoleHint: 'owner' | 'tutor' | 'parent' | 'student' | null = null;
  let viewerEmailForWatermark: string | null = null;

  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', file.organization_id)
    .maybeSingle();
  if (member?.role === 'owner' || member?.role === 'tutor') {
    viewerRoleHint = member.role;
  } else if (!file.is_org_library && file.student_id) {
    const { data: parent } = await admin
      .from('parents')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (parent) {
      const { data: link } = await admin
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('student_id', file.student_id)
        .is('revoked_at', null)
        .maybeSingle();
      if (link) viewerRoleHint = 'parent';
    }
  }

  // Student viewer: only if file's intended_student_id is set and matches.
  if (!viewerRoleHint && file.intended_student_id) {
    const { data: studentUser } = await admin
      .from('student_users')
      .select('id, student_id, email, disabled_at')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (studentUser && !studentUser.disabled_at && studentUser.student_id === file.intended_student_id) {
      viewerRoleHint = 'student';
      viewerEmailForWatermark = studentUser.email;
    }
  }

  if (!viewerRoleHint) {
    return res.status(403).json({ error: 'Not authorized to view this file.' });
  }

  // Generate signed URL (use converted PDF if present; otherwise original).
  const path = file.converted_pdf_path ?? file.storage_path;
  const { data: signed, error: signErr } = await admin.storage
    .from('files')
    .createSignedUrl(path, SIGNED_DOWNLOAD_TTL);
  if (signErr || !signed?.signedUrl) {
    console.error('[files/view-url] sign failed', signErr);
    return res.status(500).json({ error: 'Could not prepare view URL.' });
  }

  // Resolve plan tier for watermark text (Solo: brand only; Team/Growth: org
  // name prefix). Watermarks render for every viewer now (P1-3.1).
  const { data: org } = await admin
    .from('organizations').select('plan_tier, name').eq('id', file.organization_id).maybeSingle();
  const planTier = (org?.plan_tier ?? 'solo') as PlanTier;

  // Audit row — server-side guarantee.
  const ipHeader = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ipAddress = ipHeader.split(',')[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  const viewerRole = deriveViewerRole({
    isOrgOwner: viewerRoleHint === 'owner',
    isOrgTutor: viewerRoleHint === 'tutor',
    isParent: viewerRoleHint === 'parent',
    isStudent: viewerRoleHint === 'student',
  });

  // Dedupe within a 5-minute window (P2-3.2). Casual back-and-forth from one
  // viewer would otherwise log multiple rows; we collapse those into a single
  // event with viewed_at bumped on each return.
  const dedupeWindowMs = 5 * 60 * 1000;
  const sinceIso = new Date(Date.now() - dedupeWindowMs).toISOString();
  const { data: recentView } = await admin
    .from('file_views')
    .select('id')
    .eq('file_id', fileId)
    .eq('viewer_user_id', userId)
    .gte('viewed_at', sinceIso)
    .order('viewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentView?.id) {
    await admin
      .from('file_views')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', recentView.id);
  } else {
    await admin.from('file_views').insert({
      file_id: fileId,
      viewer_user_id: userId,
      viewer_role: viewerRole,
      ip_address: ipAddress,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    });
  }

  const expiresAt = new Date(Date.now() + SIGNED_DOWNLOAD_TTL * 1000).toISOString();

  // Tutor branding for the viewer header. Use the file's uploader as the
  // "tutor"; fall back gracefully when the column / row is missing.
  let tutorName: string | null = null;
  if ((file as any).uploaded_by_user_id) {
    const { data: uploader } = await admin
      .from('profiles')
      .select('owner_name')
      .eq('id', (file as any).uploaded_by_user_id)
      .maybeSingle();
    tutorName = uploader?.owner_name ?? null;
  }

  // Students always see the strict watermark (their email + tutor + ts).
  const watermarkBase = viewerRoleHint === 'student'
    ? `${viewerEmailForWatermark} · ${org?.name ?? 'crestio.ai'}`
    : watermarkFor(org?.name, planTier);

  return res.status(200).json({
    signed_url: signed.signedUrl,
    expires_at: expiresAt,
    mime_type: file.mime_type,
    watermark_text: watermarkBase,
    allow_printing: viewerRoleHint === 'student' ? false : file.allow_printing === true,
    display_name: (file as any).display_name ?? null,
    organization_name: org?.name ?? null,
    tutor_name: tutorName,
  });
}
