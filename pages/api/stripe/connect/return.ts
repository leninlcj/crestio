import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrgWithConnect, syncConnectAccountStatus } from '../../../../lib/stripe/connect';
import { verifyConnectLinkToken } from '../../../../lib/stripe/connectLinkTokens';

// GET /api/stripe/connect/return?t=<token>
// Stripe redirects here after the user finishes (or aborts) onboarding. Sync
// the org's Connect status from Stripe, then redirect to the payouts page.
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

  try {
    const org = await getOrgWithConnect(admin, verified.orgId);
    if (org?.stripe_connect_account_id) {
      await syncConnectAccountStatus(admin, org.stripe_connect_account_id);
    }
  } catch (e) {
    console.error('[connect/return] sync failed', e);
  }
  return res.redirect(302, '/app/owner/payouts?connect=updated');
}
