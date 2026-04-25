// GET /api/files/storage-usage — current org's bytes used vs cap, for the UI
// progress bar on the Files tab.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationIdForUser } from '../../../lib/organization';
import { getPlanLimits } from '../../../lib/files';
import type { PlanTier } from '../../../lib/billing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const orgId = await getOrganizationIdForUser(userClient, userData.user.id);
  if (!orgId) return res.status(403).json({ error: 'No organization.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: org } = await admin
    .from('organizations')
    .select('plan_tier, storage_used_bytes')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return res.status(404).json({ error: 'Org not found.' });

  const planTier = (org.plan_tier ?? 'solo') as PlanTier;
  const limits = getPlanLimits(planTier);
  const used = Number(org.storage_used_bytes ?? 0);

  return res.status(200).json({
    plan_tier: planTier,
    used_bytes: used,
    cap_bytes: limits.maxOrgBytes,
    max_file_bytes: limits.maxFileBytes,
    org_library: limits.orgLibrary,
    search: limits.search,
    watermark: limits.watermark,
    office_conversion: limits.officeConversion,
  });
}
