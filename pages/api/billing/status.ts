import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { daysLeftInTrial } from '../../../lib/billing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Never let any layer (browser, CDN, proxy) cache this — subscription state
  // changes out-of-band via Stripe webhooks.
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  // select('*') so new columns (e.g. cancel_at_period_end added in 10.5) are
  // picked up automatically once the migration runs.
  const { data: org, error: orgErr } = await userClient
    .from('organizations')
    .select('*')
    .eq('id', membership.organization_id)
    .maybeSingle();
  if (orgErr) {
    console.error('[billing/status] org lookup failed', {
      user_id: userData.user.id,
      organization_id: membership.organization_id,
      error: orgErr.message,
    });
    return res.status(500).json({ error: 'Could not read subscription state.' });
  }
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const status = (org.subscription_status ?? 'trialing') as string;
  const days = daysLeftInTrial(org.trial_ends_at);
  const isInTrial = status === 'trialing' && (days ?? 0) > 0;
  const isActive = status === 'active' || isInTrial;
  const cancelAtPeriodEnd = Boolean((org as any).cancel_at_period_end);

  const body: Record<string, unknown> = {
    subscription_status: status,
    trial_ends_at: org.trial_ends_at ?? null,
    current_period_end: org.current_period_end ?? null,
    days_left_in_trial: isInTrial ? days : null,
    is_in_trial: isInTrial,
    is_active: isActive,
    stripe_customer_id_present: !!org.stripe_customer_id,
    stripe_subscription_id_present: !!org.stripe_subscription_id,
    cancel_at_period_end: cancelAtPeriodEnd,
    role: membership.role,
  };

  // Server-side trace so we can see in Vercel logs what's being returned per
  // request. Avoid logging secrets.
  console.log('[billing/status]', {
    user_id: userData.user.id,
    organization_id: membership.organization_id,
    subscription_status: status,
    stripe_customer_id_present: !!org.stripe_customer_id,
    days_left_in_trial: body.days_left_in_trial,
    cancel_at_period_end: cancelAtPeriodEnd,
  });

  if (process.env.VERCEL_ENV !== 'production') {
    body._debug = {
      org_id: membership.organization_id,
      queried_at: new Date().toISOString(),
      role: membership.role,
    };
  }

  return res.status(200).json(body);
}
