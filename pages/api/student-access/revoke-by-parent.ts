import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import { firstName, loadOrgBranding } from '../../../lib/studentAccess';
import { buildParentRevokeConfirmationEmail } from '../../../lib/emails/student';

// POST /api/student-access/revoke-by-parent
// Body: { student_id: string }
// Caller must be a parent linked to the student (parent_student_links).
// Effects:
//   - student_portal_access.enabled=false, disabled_at + reason='parent revoked'
//   - student_users.disabled_at set, auth banned
//   - audit_log entry
//   - confirmation email to parent + notification to tutor

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const parentAuthId = userData.user.id;

  const body = (req.body ?? {}) as { student_id?: string };
  if (!body.student_id) return res.status(400).json({ error: 'student_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents').select('id, name, email').eq('auth_user_id', parentAuthId).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Only parents can revoke access.' });

  const { data: link } = await admin
    .from('parent_student_links')
    .select('id, organization_id')
    .eq('parent_id', parent.id)
    .eq('student_id', body.student_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (!link) return res.status(403).json({ error: 'You are not linked to this student.' });

  const { data: access } = await admin
    .from('student_portal_access').select('id').eq('student_id', body.student_id).maybeSingle();
  if (!access) return res.status(404).json({ error: 'No access record.' });

  const now = new Date().toISOString();
  await admin
    .from('student_portal_access')
    .update({
      enabled: false,
      disabled_at: now,
      disabled_reason: 'Revoked by parent',
      invitation_token: null,
      parental_consent_token: null,
      updated_at: now,
    })
    .eq('id', access.id);

  const { data: studentUser } = await admin
    .from('student_users')
    .select('id, auth_user_id, full_name')
    .eq('student_id', body.student_id)
    .maybeSingle();
  if (studentUser) {
    await admin.from('student_users').update({
      disabled_at: now, disabled_reason: 'Revoked by parent', updated_at: now,
    }).eq('id', studentUser.id);
    if (studentUser.auth_user_id) {
      try {
        await (admin.auth.admin as any).updateUserById(studentUser.auth_user_id, {
          ban_duration: '876000h',
          app_metadata: { role: 'student', portal_disabled: true },
        });
      } catch (err) { console.warn('[student-access/revoke-by-parent] auth ban failed', err); }
    }
  }

  const { data: student } = await admin
    .from('students').select('name, organization_id').eq('id', body.student_id).maybeSingle();
  const studentFirstName = firstName(student?.name);
  const branding = await loadOrgBranding(admin, link.organization_id);

  // Confirmation email to parent.
  if (parent.email) {
    const e = buildParentRevokeConfirmationEmail({
      parentName: parent.name ?? 'there',
      studentFirstName,
      tutorBusinessName: branding.name,
      brandColor: branding.brandColor,
    });
    await sendEmail({ to: parent.email, ...e, replyTo: branding.ownerEmail ?? undefined });
  }
  // Notification to tutor.
  if (branding.ownerEmail) {
    await sendEmail({
      to: branding.ownerEmail,
      subject: `${parent.name ?? 'A parent'} revoked ${studentFirstName}'s portal access`,
      text: `${parent.name ?? 'A parent'} has revoked student portal access for ${studentFirstName}.\n` +
            `${studentFirstName} can no longer sign in to the student portal.\n`,
      html: `<p>${parent.name ?? 'A parent'} has revoked student portal access for ${studentFirstName}.</p>` +
            `<p>${studentFirstName} can no longer sign in to the student portal.</p>`,
    });
  }

  await writeAudit(admin, {
    organizationId: link.organization_id,
    actorUserId: parentAuthId,
    actorRole: 'parent',
    action: 'student_access.disabled',
    entityType: 'student',
    entityId: body.student_id,
    payload: { entity_name: student?.name, source: 'parent', parent_id: parent.id },
  });

  return res.status(200).json({ ok: true });
}
