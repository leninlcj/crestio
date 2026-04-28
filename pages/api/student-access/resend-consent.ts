import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { writeAudit } from '../../../lib/audit';
import { sendEmail } from '../../../lib/email';
import {
  firstName, loadFirstParent, loadOrgBranding, newToken, originFor,
} from '../../../lib/studentAccess';
import { buildParentConsentRequestEmail } from '../../../lib/emails/student';

// POST /api/student-access/resend-consent
// Body: { student_id: string }

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
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { student_id?: string };
  if (!body.student_id) return res.status(400).json({ error: 'student_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, organization_id, parental_consent_required, parental_consent_given_at, student:students(name)')
    .eq('student_id', body.student_id)
    .maybeSingle();
  if (!access || (access as any).organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Access record not found.' });
  }
  if (!access.parental_consent_required) {
    return res.status(400).json({ error: 'This student does not require parental consent.' });
  }
  if (access.parental_consent_given_at) {
    return res.status(400).json({ error: 'Consent has already been granted.' });
  }

  const parent = await loadFirstParent(admin, body.student_id);
  if (!parent || !parent.email) return res.status(400).json({ error: 'No parent email on file.' });

  const branding = await loadOrgBranding(admin, membership.organization_id);
  const studentFirstName = firstName((access as any).student?.name);
  const newConsentToken = newToken();

  await admin
    .from('student_portal_access')
    .update({ parental_consent_token: newConsentToken, updated_at: new Date().toISOString() })
    .eq('id', access.id);

  const consentUrl = `${originFor(req)}/parent/student/${body.student_id}/grant-access?token=${newConsentToken}`;
  const { subject, html, text } = buildParentConsentRequestEmail({
    parentName: parent.name ?? 'there',
    studentFirstName,
    tutorBusinessName: branding.name,
    brandColor: branding.brandColor,
    consentUrl,
  });
  await sendEmail({ to: parent.email, subject, html, text, replyTo: branding.ownerEmail ?? undefined });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    actorRole: membership.role,
    action: 'student_access.consent_resent',
    entityType: 'student',
    entityId: body.student_id,
    payload: { entity_name: (access as any).student?.name },
  });

  return res.status(200).json({ ok: true });
}
