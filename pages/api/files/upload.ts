// POST /api/files/upload — issue a Supabase Storage signed upload URL.
//
// Two-phase upload: this endpoint validates plan tier + caps + ownership and
// inserts a `files` row with status='uploading'. The client then PUTs the
// file bytes directly to the returned signed URL (uploadToSignedUrl) and
// follows up with POST /api/files/[id]/finalize to flip status='ready'.
//
// We deviated from the brief's literal "multipart" body because Vercel
// function bodies cap below the per-file size limit; client→Storage direct
// upload also matches the existing support-attachments pattern.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getOrganizationIdForUser } from '../../../lib/organization';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';
import {
  getPlanLimits,
  sanitizeFilename,
  isExecutableFilename,
  hasPathTraversal,
  buildStoragePath,
  isOfficeMime,
} from '../../../lib/files';
import type { PlanTier } from '../../../lib/billing';

const SIGNED_UPLOAD_TTL_SECONDS = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  if (!membership || (membership.role !== 'owner' && membership.role !== 'tutor')) {
    return res.status(403).json({ error: 'Only tutors and owners can upload files.' });
  }

  const billing = await isOrgBillingOk(userClient, orgId);
  if (!billing.ok) {
    return res.status(402).json({ error: 'subscription_required', reason: billing.reason });
  }

  const rl = checkRateLimit({
    key: `files_upload:${userId}`,
    limit: LIMITS.files_upload.limit,
    windowMs: LIMITS.files_upload.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const studentId = typeof body.student_id === 'string' && body.student_id ? body.student_id : null;
  const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : null;
  const isOrgLibrary = body.is_org_library === true;
  const originalFilenameRaw = typeof body.original_filename === 'string' ? body.original_filename : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.toLowerCase() : '';
  const fileSizeBytes = Number(body.file_size_bytes);
  const displayNameRaw = typeof body.display_name === 'string' ? body.display_name.trim() : '';

  if (!originalFilenameRaw) return res.status(400).json({ error: 'original_filename is required.' });
  if (!mimeType) return res.status(400).json({ error: 'mime_type is required.' });
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return res.status(400).json({ error: 'file_size_bytes is required and must be > 0.' });
  }
  if (hasPathTraversal(originalFilenameRaw) || isExecutableFilename(originalFilenameRaw)) {
    return res.status(400).json({ error: 'Filename rejected. No path traversal or script files.' });
  }
  if (isOrgLibrary && studentId) {
    return res.status(400).json({ error: 'Org library files cannot be tied to a student.' });
  }
  if (!isOrgLibrary && !studentId) {
    return res.status(400).json({ error: 'student_id is required when not uploading to org library.' });
  }

  // Resolve plan tier and per-tier caps.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: org } = await admin
    .from('organizations')
    .select('id, plan_tier, storage_used_bytes')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return res.status(500).json({ error: 'Organization lookup failed.' });
  const planTier = (org.plan_tier ?? 'solo') as PlanTier;
  const limits = getPlanLimits(planTier);

  // Plan-tier checks ---------------------------------------------------------
  if (isOrgLibrary && !limits.orgLibrary) {
    return res.status(403).json({
      error: 'org_library_requires_team',
      message: 'Org library is a Team feature. Upgrade to share resources across all your tutors.',
    });
  }
  if (fileSizeBytes > limits.maxFileBytes) {
    return res.status(413).json({
      error: 'file_too_large',
      message: `File too large for the ${planTier} plan. Max ${(limits.maxFileBytes / (1024 * 1024)).toFixed(0)} MB per file.`,
      max_bytes: limits.maxFileBytes,
    });
  }
  if (Number(org.storage_used_bytes ?? 0) + fileSizeBytes > limits.maxOrgBytes) {
    return res.status(413).json({
      error: 'org_storage_full',
      message: 'Storage full. Delete files or upgrade plan.',
      used_bytes: Number(org.storage_used_bytes ?? 0),
      cap_bytes: limits.maxOrgBytes,
    });
  }
  if (!(limits.allowedMimeTypes as readonly string[]).includes(mimeType)) {
    if (isOfficeMime(mimeType)) {
      return res.status(415).json({
        error: 'office_not_available',
        message: "Word, Excel, and PowerPoint uploads aren't available yet. Coming soon. For now, please share as PDF or image.",
      });
    }
    return res.status(415).json({
      error: 'mime_not_allowed',
      message: `${mimeType} is not allowed. Upload a PDF or image.`,
    });
  }

  // Verify student belongs to org (and tutor has access).
  if (studentId) {
    const studentCheck = await checkStudentAccess(userClient, admin, {
      studentId,
      orgId,
      role: membership.role,
      tutorId: membership.tutor_id,
    });
    if (!studentCheck.ok) return res.status(studentCheck.status).json({ error: studentCheck.error });
  }

  // Verify session belongs to same org and (if studentId given) the same student.
  if (sessionId) {
    const { data: sess } = await admin
      .from('sessions')
      .select('id, organization_id, student_id, tutor_user_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!sess || sess.organization_id !== orgId) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    if (studentId && sess.student_id !== studentId) {
      return res.status(400).json({ error: 'session_id and student_id do not match.' });
    }
    if (membership.role === 'tutor' && sess.tutor_user_id !== userId) {
      return res.status(403).json({ error: 'You can only attach files to your own sessions.' });
    }
  }

  // Build storage path + insert row.
  const fileId = randomUUID();
  const sanitized = sanitizeFilename(originalFilenameRaw);
  const storagePath = buildStoragePath({
    organizationId: orgId,
    studentId,
    isOrgLibrary,
    fileId,
    sanitizedFilename: sanitized,
  });

  const displayName = displayNameRaw || sanitized;

  const { data: inserted, error: insertErr } = await admin
    .from('files')
    .insert({
      id: fileId,
      organization_id: orgId,
      uploaded_by_user_id: userId,
      student_id: studentId,
      session_id: sessionId,
      storage_path: storagePath,
      original_filename: sanitized,
      display_name: displayName,
      mime_type: mimeType,
      file_size_bytes: Math.floor(fileSizeBytes),
      is_org_library: isOrgLibrary,
      status: 'uploading',
    })
    .select('id, storage_path, status, file_size_bytes, display_name, organization_id')
    .single();
  if (insertErr || !inserted) {
    console.error('[files/upload] insert failed', insertErr);
    return res.status(500).json({ error: 'Could not create file record.' });
  }

  // Issue signed upload URL.
  const { data: signed, error: signErr } = await admin.storage
    .from('files')
    .createSignedUploadUrl(storagePath);
  if (signErr || !signed?.signedUrl || !signed?.token) {
    console.error('[files/upload] signed upload url failed', signErr);
    // Roll back the row we just created so storage_used_bytes returns to baseline.
    await admin.from('files').delete().eq('id', fileId);
    return res.status(500).json({ error: 'Could not prepare upload URL.' });
  }

  return res.status(200).json({
    file: {
      id: inserted.id,
      storage_path: inserted.storage_path,
      display_name: inserted.display_name,
      file_size_bytes: inserted.file_size_bytes,
      status: inserted.status,
    },
    signed_upload_url: signed.signedUrl,
    signed_upload_token: signed.token,
    expires_in_seconds: SIGNED_UPLOAD_TTL_SECONDS,
  });
}

async function checkStudentAccess(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  opts: { studentId: string; orgId: string; role: 'owner' | 'tutor'; tutorId: string | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: student } = await admin
    .from('students')
    .select('id, organization_id, primary_tutor_id')
    .eq('id', opts.studentId)
    .maybeSingle();
  if (!student || student.organization_id !== opts.orgId) {
    return { ok: false, status: 404, error: 'Student not found.' };
  }
  if (opts.role === 'tutor') {
    if (!opts.tutorId || student.primary_tutor_id !== opts.tutorId) {
      return { ok: false, status: 403, error: 'You do not have access to this student.' };
    }
  }
  return { ok: true };
}
