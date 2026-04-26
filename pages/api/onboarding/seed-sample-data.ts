import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { seedSampleData } from '../../../lib/onboarding/seedSampleData';

// POST /api/onboarding/seed-sample-data
// Idempotent: refuses if the user already has has_sample_data=true OR has any
// real students. Owner-only.
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
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can seed sample data.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Refuse if profile already flagged or any non-sample students exist.
  const { data: profile } = await admin
    .from('profiles')
    .select('has_sample_data, sample_data_dismissed_at')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.has_sample_data) {
    return res.status(200).json({ ok: true, already_seeded: true });
  }
  if (profile?.sample_data_dismissed_at) {
    return res.status(200).json({ ok: true, dismissed: true });
  }

  const { count } = await admin
    .from('students').select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id)
    .eq('is_sample', false);
  if ((count ?? 0) > 0) {
    return res.status(200).json({ ok: true, has_real_students: true });
  }

  const result = await seedSampleData({ admin, userId, organizationId: membership.organization_id });
  return res.status(200).json({ ok: true, ...result });
}
