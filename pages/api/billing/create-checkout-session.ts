import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getStripe, getBaseUrl } from '../../../lib/stripe';
import { getMembershipForUser } from '../../../lib/membership';
import { PLAN_CATALOGUE, priceIdFor, type BillingInterval } from '../../../lib/plans';
import type { PlanTier } from '../../../lib/billing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured (Supabase).' });

  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? '';

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the organisation owner can manage billing.' });
  }

  const body = (req.body ?? {}) as { plan?: string; interval?: string };
  const requestedPlan = (body.plan as PlanTier | undefined) ?? 'solo';
  const requestedInterval = (body.interval as BillingInterval | undefined) ?? 'monthly';
  if (!PLAN_CATALOGUE[requestedPlan]) {
    return res.status(400).json({ error: `Unknown plan: ${body.plan}` });
  }
  if (requestedInterval !== 'monthly' && requestedInterval !== 'annual') {
    return res.status(400).json({ error: `Unknown interval: ${body.interval}` });
  }
  const entry = PLAN_CATALOGUE[requestedPlan];
  if (entry.isContactSales) {
    return res.status(400).json({ error: 'Contact sales for this plan.' });
  }

  const priceResult = priceIdFor(requestedPlan, requestedInterval);
  if ('error' in priceResult) {
    return res.status(500).json({ error: `Server misconfigured: ${priceResult.error}` });
  }

  const { data: org } = await userClient
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', membership.organization_id)
    .maybeSingle();
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  try {
    const stripe = getStripe();

    let customerId = org.stripe_customer_id as string | null;
    let repeatCustomer = false;

    if (!customerId) {
      // Trial abuse check — does a Stripe customer exist for this email, and
      // has it ever had a subscription? If so, reuse it and skip fresh trial.
      const existing = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (existing.data.length > 0) {
        const candidate = existing.data[0];
        const subs = await stripe.subscriptions.list({ customer: candidate.id, limit: 1, status: 'all' });
        if (subs.data.length > 0) {
          customerId = candidate.id;
          repeatCustomer = true;
        }
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          name: org.name,
          email: userEmail,
          metadata: { organization_id: org.id },
        });
        customerId = customer.id;
      }

      // Persist customer id via service role (orgs.update is owner-only; we
      // already validated owner, but service-role writes are immediate).
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        await admin
          .from('organizations')
          .update({ stripe_customer_id: customerId })
          .eq('id', org.id);
      } else {
        await userClient
          .from('organizations')
          .update({ stripe_customer_id: customerId })
          .eq('id', org.id);
      }
    } else {
      // Customer already linked — check if it's had a prior subscription (for
      // the repeat_customer flag in the response).
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' });
      if (subs.data.length > 0) repeatCustomer = true;
    }

    const baseUrl = getBaseUrl(req);
    const trialDays = repeatCustomer ? 0 : entry.trialDays;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceResult.priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays > 0 ? trialDays : undefined,
        metadata: {
          organization_id: org.id,
          plan_tier: requestedPlan,
          billing_interval: requestedInterval,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        organization_id: org.id,
        plan_tier: requestedPlan,
        billing_interval: requestedInterval,
        repeat_customer: repeatCustomer ? 'true' : 'false',
      },
      success_url: `${baseUrl}/app/settings/billing?billing=success`,
      cancel_url: `${baseUrl}/app/settings/billing?billing=cancelled`,
    });

    return res.status(200).json({ url: session.url, repeat_customer: repeatCustomer });
  } catch (e: any) {
    console.error('[billing/create-checkout-session] Stripe error', {
      type: e?.type,
      code: e?.code,
      message: e?.message,
      requestId: e?.requestId,
      statusCode: e?.statusCode,
    });
    return res.status(500).json({
      error: "Couldn't start checkout. Please try again, or contact support if this continues.",
    });
  }
}
