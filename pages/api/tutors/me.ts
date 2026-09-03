import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { findOrLinkTutorRow } from '../../../lib/tutorIdentity';
import { writeAudit } from '../../../lib/audit';

// GET /api/tutors/me — the signed-in tutor's own record (agreement status etc.)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
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
  if (!membership) return res.status(403).json({ error: 'No organisation.' });
  if (membership.role !== 'tutor') return res.status(200).json({ found: false, role: membership.role });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { tutor, linked } = await findOrLinkTutorRow(admin, { userId: userData.user.id, email: userData.user.email ?? null, organizationId: membership.organization_id });
  if (linked && tutor) {
    await writeAudit(admin, { organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: 'tutor', action: 'tutor.linked', entityType: 'tutor', entityId: tutor.id, payload: { entity_name: tutor.name } });
  }
  if (!tutor) return res.status(200).json({ found: false, role: 'tutor' });
  return res.status(200).json({
    found: true,
    role: 'tutor',
    tutor_id: tutor.id,
    name: tutor.name,
    agreement_accepted_at: tutor.agreement_accepted_at ?? null,
    agreement_version: tutor.agreement_version ?? null,
    conduct_accepted_at: tutor.conduct_accepted_at ?? null,
    wwcc_number: tutor.wwcc_number ?? null,
    wwcc_expiry: tutor.wwcc_expiry ?? null,
    wwcc_verified_at: tutor.wwcc_verified_at ?? null,
  });
}
