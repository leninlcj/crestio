import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../lib/stripe';
import { getOrgWithConnect } from '../../../lib/stripe/connect';

// GET /api/parent-portal/saved-cards
// Lists payment methods saved on the parent's Stripe Customer (scoped to one
// connected account / org).
//
// DELETE /api/parent-portal/saved-cards?paymentMethodId=pm_xxx
// Detaches a payment method from the customer.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents')
    .select('id, stripe_customer_id, stripe_customer_org_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Parent account required.' });
  if (!parent.stripe_customer_id || !parent.stripe_customer_org_id) {
    return res.status(200).json({ saved_cards: [], org_id: null });
  }

  const org = await getOrgWithConnect(admin, parent.stripe_customer_org_id);
  if (!org?.stripe_connect_account_id) {
    return res.status(200).json({ saved_cards: [], org_id: parent.stripe_customer_org_id });
  }

  const stripe = getStripe();

  if (req.method === 'DELETE') {
    const pmId = typeof req.query.paymentMethodId === 'string' ? req.query.paymentMethodId : '';
    if (!pmId) return res.status(400).json({ error: 'paymentMethodId required.' });
    try {
      // Confirm the PM belongs to the parent's customer.
      const pm = await stripe.paymentMethods.retrieve(pmId, undefined, {
        stripeAccount: org.stripe_connect_account_id,
      });
      if (pm.customer !== parent.stripe_customer_id) {
        return res.status(403).json({ error: 'Not your payment method.' });
      }
      await stripe.paymentMethods.detach(pmId, undefined, {
        stripeAccount: org.stripe_connect_account_id,
      });
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error('[saved-cards/DELETE] failed', e);
      return res.status(500).json({ error: e?.message ?? 'Failed to remove card.' });
    }
  }

  // GET — list cards.
  try {
    const list = await stripe.paymentMethods.list(
      { customer: parent.stripe_customer_id, type: 'card' },
      { stripeAccount: org.stripe_connect_account_id },
    );
    const cards = list.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      exp_month: pm.card?.exp_month ?? null,
      exp_year: pm.card?.exp_year ?? null,
    }));
    return res.status(200).json({ saved_cards: cards, org_id: parent.stripe_customer_org_id, org_name: org.name });
  } catch (e: any) {
    console.error('[saved-cards/GET] failed', e);
    return res.status(500).json({ error: e?.message ?? 'Failed to load cards.' });
  }
}
