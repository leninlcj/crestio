import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import {
  getConnectedBalance,
  getOrgWithConnect,
  listConnectedPayouts,
  syncConnectAccountStatus,
} from '../../../../lib/stripe/connect';

// GET /api/stripe/connect/status
// Returns the caller's org Connect status + balance + recent payouts. Owner
// only. Triggers a Stripe re-sync if status is non-active so the UI never
// shows stale "pending" after the user completes onboarding.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  let org = await getOrgWithConnect(admin, membership.organization_id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  // Re-sync if non-active or no row yet — keeps the UI fresh after onboarding.
  if (org.stripe_connect_account_id && org.stripe_connect_status !== 'active') {
    try {
      const refreshed = await syncConnectAccountStatus(admin, org.stripe_connect_account_id);
      if (refreshed) org = refreshed;
    } catch (e) {
      console.error('[connect/status] sync failed', e);
    }
  }

  let balance = null;
  let payouts: Array<{ id: string; amount: number; currency: string; status: string; arrival_date: number; created: number }> = [];
  if (org.stripe_connect_account_id && org.stripe_connect_charges_enabled) {
    try {
      balance = await getConnectedBalance(org.stripe_connect_account_id);
      const list = await listConnectedPayouts(org.stripe_connect_account_id, 10);
      payouts = list.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrival_date: p.arrival_date,
        created: p.created,
      }));
    } catch (e) {
      console.error('[connect/status] balance/payouts failed', e);
    }
  }

  return res.status(200).json({
    status: org.stripe_connect_status,
    charges_enabled: org.stripe_connect_charges_enabled,
    payouts_enabled: org.stripe_connect_payouts_enabled,
    requirements: org.stripe_connect_requirements,
    country: org.stripe_connect_country,
    onboarded_at: org.stripe_connect_onboarded_at,
    has_account: Boolean(org.stripe_connect_account_id),
    balance,
    payouts,
  });
}
