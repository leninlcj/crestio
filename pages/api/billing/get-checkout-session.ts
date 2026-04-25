import type { NextApiRequest, NextApiResponse } from 'next';
import { getStripe } from '../../../lib/stripe';

// Public endpoint — anyone with a session id can read whitelisted fields.
// Stripe session ids are unguessable; we still keep the response small to
// avoid leaking unrelated metadata.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (!sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const source = (session.metadata?.source as string | undefined) ?? null;
    const planTier = (session.metadata?.plan_tier as string | undefined) ?? null;
    const billingInterval = (session.metadata?.billing_interval as string | undefined) ?? null;
    const email = session.customer_details?.email ?? session.customer_email ?? null;

    return res.status(200).json({
      payment_status: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      source,
      plan_tier: planTier,
      billing_interval: billingInterval,
      customer_email: email,
    });
  } catch (e: any) {
    if (e?.code === 'resource_missing') {
      return res.status(404).json({ error: 'session_not_found' });
    }
    console.error('[billing/get-checkout-session] stripe error', {
      type: e?.type,
      code: e?.code,
      message: e?.message,
    });
    return res.status(500).json({ error: 'lookup_failed' });
  }
}
