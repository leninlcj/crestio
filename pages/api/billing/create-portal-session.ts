import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getStripe, getBaseUrl } from '../../../lib/stripe';
import { getMembershipForUser } from '../../../lib/membership';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the organization owner can manage billing.' });
  }

  const { data: org } = await userClient
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', membership.organization_id)
    .maybeSingle();
  if (!org?.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer for this org. Subscribe first.' });
  }

  try {
    const stripe = getStripe();
    const baseUrl = getBaseUrl(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${baseUrl}/app/settings`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (e: any) {
    console.error('[billing/create-portal-session] Stripe error', {
      type: e?.type,
      code: e?.code,
      message: e?.message,
      requestId: e?.requestId,
      statusCode: e?.statusCode,
    });
    return res.status(500).json({
      error: "Couldn't open the billing portal. Please try again, or contact support if this continues.",
    });
  }
}
