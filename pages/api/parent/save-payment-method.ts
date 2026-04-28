import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// POST /api/parent/save-payment-method  → returns { checkout_url } that
// the client redirects to. Stripe Setup-mode Checkout collects + saves a
// card on the connected account. On return, the webhook stores the
// payment method ID on parents.stripe_default_payment_method_id.
//
// GET ?parent_id=...  → returns the saved card's brand + last4 via Stripe
// PaymentMethod.retrieve.
//
// Auto-charging on invoice.sent is queued for a follow-up commit (14F+).
// Today, this only collects + stores the card; charging stays manual.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return getCardSummary(req, res);
  if (req.method === 'POST') return startSaveFlow(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getCardSummary(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!url || !serviceKey || !stripeKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const parentId = (Array.isArray(req.query.parent_id) ? req.query.parent_id[0] : req.query.parent_id) ?? '';
  if (!parentId) return res.status(400).json({ error: 'parent_id required' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents').select('stripe_default_payment_method_id').eq('id', parentId).maybeSingle();

  const pmId = (parent as any)?.stripe_default_payment_method_id;
  if (!pmId) return res.status(200).json({ last4: null, brand: null });

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const card = (pm as any).card;
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ last4: card?.last4 ?? null, brand: card?.brand ?? null });
  } catch {
    return res.status(200).json({ last4: null, brand: null });
  }
}

async function startSaveFlow(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
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
    .select('id, email, stripe_customer_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!parent) return res.status(403).json({ error: 'No parent account linked.' });

  if (!stripeKey) {
    // Local dev convenience — pretend the card was saved.
    console.warn('[save-payment-method] STRIPE_SECRET_KEY missing; simulating');
    return res.status(200).json({ checkout_url: '/parent/settings?saved=simulated' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });

    let customerId = (parent as any).stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (parent as any).email,
        metadata: { parent_id: (parent as any).id },
      });
      customerId = customer.id;
      await admin.from('parents').update({ stripe_customer_id: customerId }).eq('id', (parent as any).id);
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const checkout = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer: customerId,
      success_url: `${origin}/parent/invoices?card_saved=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/parent/invoices`,
      client_reference_id: (parent as any).id,
      metadata: { parent_id: (parent as any).id, intent: 'save_default_payment_method' },
    });

    return res.status(200).json({ checkout_url: checkout.url });
  } catch (err) {
    console.error('[save-payment-method] stripe error', err);
    return res.status(500).json({ error: 'Could not start the save flow. Try again.' });
  }
}
