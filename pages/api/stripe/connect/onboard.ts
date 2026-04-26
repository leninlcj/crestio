import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { getOnboardingLink } from '../../../../lib/stripe/connect';
import { signConnectLinkToken } from '../../../../lib/stripe/connectLinkTokens';
import { getBaseUrl } from '../../../../lib/stripe';

// POST /api/stripe/connect/onboard
// Owner-only. Creates (or reuses) the org's Connect Express account, returns
// a fresh Account Link URL the client should redirect to.
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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const baseUrl = getBaseUrl(req);
  const linkToken = signConnectLinkToken(membership.organization_id);
  const refreshUrl = `${baseUrl}/api/stripe/connect/refresh?t=${encodeURIComponent(linkToken)}`;
  const returnUrl = `${baseUrl}/api/stripe/connect/return?t=${encodeURIComponent(linkToken)}`;

  try {
    const onboardingUrl = await getOnboardingLink(admin, membership.organization_id, refreshUrl, returnUrl);
    return res.status(200).json({ url: onboardingUrl });
  } catch (e: any) {
    console.error('[connect/onboard] failed', e);
    return res.status(500).json({ error: e?.message ?? 'Failed to create onboarding link.' });
  }
}
