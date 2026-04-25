import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { resolvePriceId, PLAN_CATALOGUE } from '../../../lib/plans';
import type { PlanTier } from '../../../lib/billing';
import {
  processReferralOnTrialConversion,
  rejectReferralForPaymentFailure,
} from '../../../lib/referralConversion';
import { pushCreditsToStripeBalance } from '../../../lib/credits';
import { ensureUserAndMagicLink } from '../../../lib/auth/magic-link';
import { buildWelcomeEmail } from '../../../lib/emails/welcome';
import { sendEmail } from '../../../lib/email';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('[stripe/webhook] failed to read raw body', e);
    return res.status(400).json({ error: 'Could not read body.' });
  }

  if (!webhookSecret) {
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — acknowledging without verification');
    return res.status(200).json({ received: true, verified: false });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing signature.' });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('[stripe/webhook] signature verification failed', err?.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err?.message}` });
  }

  const admin = getAdmin();
  if (!admin) {
    console.error('[stripe/webhook] SUPABASE_SERVICE_ROLE_KEY missing — skipping DB write');
    return res.status(200).json({ received: true, persisted: false });
  }

  try {
    // Idempotent log insert. ON CONFLICT (stripe_event_id) DO NOTHING via upsert.
    const eventOrgId = await resolveOrgId(admin, event);
    await admin
      .from('billing_events')
      .upsert(
        {
          organization_id: eventOrgId,
          stripe_event_id: event.id,
          event_type: event.type,
          payload: event as any,
        },
        { onConflict: 'stripe_event_id', ignoreDuplicates: true },
      );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionToOrg(admin, sub);

        // Referral hook: trial → active transition.
        if (event.type === 'customer.subscription.updated') {
          const prevStatus =
            (event.data.previous_attributes as { status?: string } | undefined)?.status;
          if (prevStatus === 'trialing' && sub.status === 'active') {
            try {
              const stripe = getStripe();
              await handleTrialToActiveReferral(admin, stripe, sub);
            } catch (e) {
              console.error('[stripe/webhook] referral conversion failed', e);
            }
          }
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // New: Payment Link source — provision a fresh user + org + magic-link
        // email. Runs alongside (not instead of) the existing org-match branch
        // so resub flows from already-onboarded customers still sync normally.
        if (session.metadata?.source === 'payment_link') {
          try {
            await provisionFromPaymentLink(admin, session);
          } catch (e) {
            console.error('[stripe/webhook] payment_link provisioning failed', {
              event_id: event.id,
              error: (e as Error)?.message,
            });
          }
        }
        if (session.subscription && typeof session.subscription === 'string') {
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            await syncSubscriptionToOrg(admin, sub);
          } catch (e) {
            console.error('[stripe/webhook] could not retrieve subscription from checkout.session.completed', e);
          }
        }
        break;
      }
      case 'invoice.upcoming': {
        // Fires ~3 days before billing. Push pending credits to Stripe
        // balance so they auto-apply to the upcoming invoice.
        const invoice = event.data.object as Stripe.Invoice;
        try {
          await handleInvoiceUpcomingCredits(admin, invoice);
        } catch (e) {
          console.error('[stripe/webhook] credit application failed', e);
        }
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (subId) {
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subId);
            await syncSubscriptionToOrg(admin, sub);
            // Referral hook: payment_failed on a first-paid-invoice cancels
            // any pending referral for this customer.
            if (event.type === 'invoice.payment_failed') {
              const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
              const refereeUserId = await resolveOwnerUserIdForCustomer(admin, customerId);
              if (refereeUserId) await rejectReferralForPaymentFailure(admin, refereeUserId);
            }
          } catch (e) {
            console.error('[stripe/webhook] could not sync from invoice event', e);
          }
        }
        break;
      }
      case 'customer.subscription.trial_will_end': {
        console.log('[stripe/webhook] trial_will_end', event.id);
        break;
      }
      default:
        // Other events are logged but not acted on.
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error('[stripe/webhook] handler error', e);
    return res.status(500).json({ error: e?.message ?? 'Webhook handler failed.' });
  }
}

// ---------------------------------------------------------------------------
// Referral / credits helpers
// ---------------------------------------------------------------------------

async function resolveOwnerUserIdForCustomer(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  customerId: string,
): Promise<string | null> {
  const { data: org } = await admin
    .from('organizations')
    .select('owner_user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return (org?.owner_user_id as string | null) ?? null;
}

async function handleTrialToActiveReferral(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const refereeUserId = await resolveOwnerUserIdForCustomer(admin, customerId);
  if (!refereeUserId) return; // Not linked — nothing to do.

  // Compute the referee's monthly-equivalent price. Annual plans normalise
  // to per-month so the 25% credit is measured against a single bill.
  const item = sub.items.data[0];
  const unitAmount = item?.price?.unit_amount ?? 0;
  const interval = item?.price?.recurring?.interval;
  const monthly = interval === 'year' ? Math.round(unitAmount / 12) : unitAmount;

  await processReferralOnTrialConversion({ admin, stripe }, {
    refereeUserId,
    refereeCustomerId: customerId,
    refereeMonthlyPriceCents: monthly,
  });
}

async function handleInvoiceUpcomingCredits(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
  if (!customerId) return;
  const userId = await resolveOwnerUserIdForCustomer(admin, customerId);
  if (!userId) return;
  const stripe = getStripe();
  await pushCreditsToStripeBalance({
    admin,
    stripe,
    userId,
    stripeCustomerId: customerId,
    upcomingInvoiceId: invoice.id ?? null,
  });
}

async function resolveOrgId(admin: ReturnType<typeof getAdmin>, event: Stripe.Event): Promise<string | null> {
  if (!admin) return null;
  const obj = event.data.object as any;
  const metaOrgId = obj?.metadata?.organization_id ?? obj?.subscription_details?.metadata?.organization_id;
  if (typeof metaOrgId === 'string' && metaOrgId.length > 0) return metaOrgId;
  const customerId = typeof obj?.customer === 'string' ? obj.customer : null;
  if (customerId) {
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payment Link provisioning — creates an auth user (handle_new_user trigger
// scaffolds profile/org/membership), links Stripe ids to the org, sends a
// welcome email containing a magic-link CTA. Idempotent: re-running for the
// same checkout session is a no-op via billing_events dedupe + the user
// existence check.
// ---------------------------------------------------------------------------

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

async function provisionFromPaymentLink(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  if (!email) {
    console.warn('[stripe/webhook] payment_link session missing email', { session: session.id });
    return;
  }

  const planTier = session.metadata?.plan_tier as PlanTier | undefined;
  const billingInterval = session.metadata?.billing_interval as 'monthly' | 'annual' | undefined;
  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

  if (!planTier || !billingInterval) {
    console.warn('[stripe/webhook] payment_link missing plan metadata', { session: session.id });
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://crestio.ai';
  const redirectTo = `${baseUrl}/app`;

  console.log('[stripe/webhook] payment_link provisioning', {
    session: session.id,
    email_domain: emailDomain(email),
    plan: planTier,
    interval: billingInterval,
    customer: customerId,
  });

  const result = await ensureUserAndMagicLink({ admin, email, redirectTo });
  if (!result.ok) {
    console.error('[stripe/webhook] ensureUserAndMagicLink failed', {
      session: session.id,
      error: result.error,
    });
    return;
  }
  const { userId, magicLink, isNewUser } = result;

  // Look up the org auto-created by the handle_new_user trigger (or the
  // user's existing org for repeat customers).
  const { data: org } = await admin
    .from('organizations')
    .select('id, stripe_customer_id, stripe_subscription_id')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (!org?.id) {
    console.error('[stripe/webhook] org not found after user create', {
      session: session.id,
      user: userId,
    });
    return;
  }

  const update: Record<string, unknown> = {
    plan_tier: planTier,
    billing_interval: billingInterval,
    subscription_status: 'active',
    subscription_updated_at: new Date().toISOString(),
    cancel_at_period_end: false,
  };
  if (customerId) update.stripe_customer_id = customerId;
  if (subscriptionId) update.stripe_subscription_id = subscriptionId;

  const { error: orgUpdateErr } = await admin
    .from('organizations')
    .update(update)
    .eq('id', org.id);
  if (orgUpdateErr) {
    console.error('[stripe/webhook] payment_link org update failed', {
      session: session.id,
      error: orgUpdateErr.message,
      code: orgUpdateErr.code,
    });
  } else {
    console.log('[stripe/webhook] payment_link org updated', {
      session: session.id,
      org: org.id,
      is_new_user: isNewUser,
    });
  }

  // Send the welcome email with the magic-link CTA. New users always get
  // it; for repeat customers (existing org), we still send so they have a
  // fresh sign-in link in case they weren't logged in when paying.
  try {
    const planLabel = PLAN_CATALOGUE[planTier]?.label ?? planTier;
    const billingIntervalLabel = billingInterval === 'monthly' ? 'monthly' : 'annual';
    const built = buildWelcomeEmail({
      recipientEmail: email,
      magicLinkUrl: magicLink,
      planLabel,
      billingIntervalLabel,
    });
    const emailResult = await sendEmail({
      to: email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    console.log('[stripe/webhook] welcome email', {
      session: session.id,
      email_domain: emailDomain(email),
      success: emailResult.success,
      id: emailResult.id,
      error: emailResult.error,
    });
  } catch (e) {
    console.error('[stripe/webhook] welcome email threw', e);
  }
}

async function syncSubscriptionToOrg(
  admin: ReturnType<typeof getAdmin>,
  sub: Stripe.Subscription,
): Promise<void> {
  if (!admin) return;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const metaOrgId = (sub.metadata as any)?.organization_id as string | undefined;

  // Find the org by metadata first, fall back to customer_id match.
  let orgId: string | null = null;
  if (metaOrgId) orgId = metaOrgId;
  if (!orgId) {
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    orgId = data?.id ?? null;
  }
  if (!orgId) {
    console.warn('[stripe/webhook] no org match for subscription', sub.id, 'customer', customerId);
    return;
  }

  const periodEnd = (sub as any).current_period_end as number | null;

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    subscription_status: sub.status,
    subscription_updated_at: new Date().toISOString(),
    cancel_at_period_end: Boolean((sub as any).cancel_at_period_end),
  };
  if (typeof periodEnd === 'number') {
    update.current_period_end = new Date(periodEnd * 1000).toISOString();
  }
  if (sub.trial_end) {
    update.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
  }

  // Resolve plan_tier + billing_interval from the subscription's first item's
  // price. Uses metadata first (set by our checkout session), falls back to
  // price-id lookup, then to legacy defaults.
  const metaTier = (sub.metadata as any)?.plan_tier as string | undefined;
  const metaInterval = (sub.metadata as any)?.billing_interval as string | undefined;
  if (metaTier === 'solo' || metaTier === 'team' || metaTier === 'growth') {
    update.plan_tier = metaTier;
  }
  if (metaInterval === 'monthly' || metaInterval === 'annual') {
    update.billing_interval = metaInterval;
  }
  if (update.plan_tier === undefined || update.billing_interval === undefined) {
    const items = (sub.items?.data ?? []) as Stripe.SubscriptionItem[];
    const firstPriceId = items[0]?.price?.id;
    if (firstPriceId) {
      const resolved = resolvePriceId(firstPriceId);
      if (resolved) {
        if (update.plan_tier === undefined) update.plan_tier = resolved.tier;
        if (update.billing_interval === undefined) update.billing_interval = resolved.interval;
      }
    }
  }

  // If the column doesn't exist yet (pre-10.5 migration), Supabase returns
  // code PGRST204 / 42703 — retry without the field rather than erroring out
  // and making Stripe retry forever.
  const { error } = await admin
    .from('organizations')
    .update(update)
    .eq('id', orgId);
  if (error) {
    // Missing-column errors: strip the newer columns and retry so Stripe doesn't
    // retry forever during a partial migration.
    if (error.code === 'PGRST204' || error.code === '42703') {
      console.warn('[stripe/webhook] column missing — retrying with core fields only', error.message);
      const fallback: Record<string, unknown> = {
        stripe_subscription_id: update.stripe_subscription_id,
        stripe_customer_id: update.stripe_customer_id,
        subscription_status: update.subscription_status,
        subscription_updated_at: update.subscription_updated_at,
      };
      if (update.current_period_end) fallback.current_period_end = update.current_period_end;
      if (update.trial_ends_at) fallback.trial_ends_at = update.trial_ends_at;
      const retry = await admin.from('organizations').update(fallback).eq('id', orgId);
      if (retry.error) {
        console.error('[stripe/webhook] org update failed on retry', retry.error);
        throw retry.error;
      }
      return;
    }
    console.error('[stripe/webhook] org update failed', error);
    throw error;
  }
}
