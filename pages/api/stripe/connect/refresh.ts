import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOnboardingLink } from '../../../../lib/stripe/connect';
import {
  signConnectLinkToken,
  verifyConnectLinkToken,
} from '../../../../lib/stripe/connectLinkTokens';
import { getBaseUrl } from '../../../../lib/stripe';

// GET /api/stripe/connect/refresh?t=<token>
// Stripe redirects here when the original Account Link expires. Mint a fresh
// Account Link and 302 to it.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  const verified = token ? verifyConnectLinkToken(token) : null;
  if (!verified) {
    return res.redirect(302, '/app/owner/payouts?connect=expired');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const baseUrl = getBaseUrl(req);
  const fresh = signConnectLinkToken(verified.orgId);
  const refreshUrl = `${baseUrl}/api/stripe/connect/refresh?t=${encodeURIComponent(fresh)}`;
  const returnUrl = `${baseUrl}/api/stripe/connect/return?t=${encodeURIComponent(fresh)}`;
  try {
    const onboardingUrl = await getOnboardingLink(admin, verified.orgId, refreshUrl, returnUrl);
    return res.redirect(302, onboardingUrl);
  } catch (e: any) {
    console.error('[connect/refresh] failed', e);
    return res.redirect(302, '/app/owner/payouts?connect=error');
  }
}
