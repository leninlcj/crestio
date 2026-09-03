import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { findOrLinkTutorRow } from '../../../lib/tutorIdentity';
import { writeAudit } from '../../../lib/audit';
import { TUTOR_AGREEMENT_VERSION } from '../../../lib/agencyLegal';
import { clientIp } from '../../../lib/agencyForms';

// POST /api/tutors/accept-agreement { version }
// Records acceptance of the Tutor Agreement + Code of Conduct on the tutor's row.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership || membership.role !== 'tutor') return res.status(403).json({ error: 'Only tutors accept the tutor agreement.' });

  const version = typeof (req.body ?? {}).version === 'string' ? String(req.body.version) : TUTOR_AGREEMENT_VERSION;
  if (version !== TUTOR_AGREEMENT_VERSION) return res.status(409).json({ error: 'The agreement has been updated. Reload and read the current version.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { tutor } = await findOrLinkTutorRow(admin, { userId: userData.user.id, email: userData.user.email ?? null, organizationId: membership.organization_id });
  if (!tutor) return res.status(404).json({ error: 'We could not find your tutor record. Ask the owner to add you under Team → Tutors with the email you signed in with.' });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('tutors')
    .update({ agreement_accepted_at: now, agreement_version: version, conduct_accepted_at: now })
    .eq('id', tutor.id)
    .select('agreement_accepted_at, agreement_version, conduct_accepted_at')
    .single();
  if (error || !data) return res.status(500).json({ error: error?.message ?? 'Could not record acceptance.' });

  await writeAudit(admin, {
    organizationId: membership.organization_id,
    actorUserId: userData.user.id,
    actorRole: 'tutor',
    action: 'tutor.agreement_accepted',
    entityType: 'tutor',
    entityId: tutor.id,
    payload: { entity_name: tutor.name, version, ip: clientIp(req.headers), user_agent: String(req.headers['user-agent'] ?? '').slice(0, 200) },
  });
  return res.status(200).json(data);
}
