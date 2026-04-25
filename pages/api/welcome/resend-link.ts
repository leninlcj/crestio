import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../lib/stripe';
import { ensureUserAndMagicLink } from '../../../lib/auth/magic-link';
import { buildWelcomeEmail } from '../../../lib/emails/welcome';
import { sendEmail } from '../../../lib/email';
import { checkRateLimit } from '../../../lib/rateLimit';
import { PLAN_CATALOGUE } from '../../../lib/plans';
import type { PlanTier } from '../../../lib/billing';

function clientKey(req: NextApiRequest, sessionId: string): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ip = fwd.split(',')[0]?.trim() || (req.socket?.remoteAddress ?? 'unknown');
  return `welcome_resend:${ip}:${sessionId}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const body = (req.body ?? {}) as { session_id?: string };
  const sessionId = (body.session_id ?? '').trim();
  if (!sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }

  const limit = checkRateLimit({
    key: clientKey(req, sessionId),
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      retry_after_seconds: limit.retry_after_seconds,
    });
  }

  let session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e: any) {
    if (e?.code === 'resource_missing') return res.status(404).json({ error: 'session_not_found' });
    console.error('[welcome/resend-link] stripe error', { code: e?.code, message: e?.message });
    return res.status(500).json({ error: 'lookup_failed' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'not_paid' });
  }
  if (session.metadata?.source !== 'payment_link') {
    return res.status(400).json({ error: 'not_payment_link_source' });
  }

  const email = session.customer_details?.email ?? session.customer_email ?? '';
  if (!email) return res.status(400).json({ error: 'no_email_on_session' });

  const planTier = (session.metadata?.plan_tier as PlanTier | undefined) ?? null;
  const billingInterval = (session.metadata?.billing_interval as 'monthly' | 'annual' | undefined) ?? null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://crestio.ai';
  const result = await ensureUserAndMagicLink({
    admin,
    email,
    redirectTo: `${baseUrl}/app`,
  });
  if (!result.ok) {
    console.error('[welcome/resend-link] ensureUserAndMagicLink failed', { error: result.error });
    return res.status(500).json({ error: 'magic_link_failed' });
  }

  const planLabel = planTier ? (PLAN_CATALOGUE[planTier]?.label ?? planTier) : 'Crestio';
  const intervalLabel = billingInterval === 'monthly' ? 'monthly' : billingInterval === 'annual' ? 'annual' : '';

  const built = buildWelcomeEmail({
    recipientEmail: email,
    magicLinkUrl: result.magicLink,
    planLabel,
    billingIntervalLabel: intervalLabel,
  });
  const sent = await sendEmail({
    to: email,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
  if (!sent.success) {
    return res.status(500).json({ error: 'email_send_failed' });
  }

  return res.status(200).json({ ok: true });
}
