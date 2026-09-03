import type { NextApiRequest, NextApiResponse } from 'next';
import { findOrLinkTutorRow } from '../../../lib/tutorIdentity';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Find the caller's primary org (where they are a member).
  const { data: myMembership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!myMembership) {
    return res.status(403).json({ error: 'No organization found for this account.' });
  }
  const organizationId = myMembership.organization_id;

  // All members of that org, plus their emails from profiles.
  const { data: members } = await admin
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, email').in('id', userIds)
    : { data: [] as { id: string; email: string | null }[] };

  const profilesById = new Map(
    (profiles ?? []).map((p) => [p.id, p.email ?? null] as const)
  );

  // Link tutor accounts to their tutors rows by email where the signup
  // trigger did not (production drift). Cheap; idempotent.
  for (const m of members ?? []) {
    if (m.role !== 'tutor') continue;
    const email = profilesById.get(m.user_id) ?? null;
    if (!email) continue;
    try {
      await findOrLinkTutorRow(admin, { userId: m.user_id, email, organizationId });
    } catch (e) {
      console.error('[tutors/team] link failed', e);
    }
  }

  const nowIso = new Date().toISOString();
  const { data: pending } = await admin
    .from('tutor_invitations')
    .select('id, email, token, created_at, expires_at')
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://crestio.ai';

  return res.status(200).json({
    organization_id: organizationId,
    is_owner: myMembership.role === 'owner',
    members: (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.created_at,
      email: profilesById.get(m.user_id) ?? null,
    })),
    pending: (pending ?? []).map((p: any) => ({
      id: p.id,
      email: p.email,
      created_at: p.created_at,
      expires_at: p.expires_at,
      accept_url: `${baseUrl}/tutor/accept?token=${p.token}`,
    })),
  });
}
