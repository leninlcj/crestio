// Manual test script. Run with: npx tsx scripts/test-webhook-cancel-flow.ts
//
// End-to-end test of the cancel → resubscribe flow against Stripe test mode
// + the live webhook endpoint. Does NOT stub anything — the assertions read
// the real organizations row via the Supabase service-role key.
//
// Required env vars (load via `.env.local` or export manually):
//   STRIPE_SECRET_KEY              (Stripe test key, sk_test_...)
//   STRIPE_PRICE_ID                (test price id)
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   TEST_ORG_ID                    (a real organization UUID to bind the test customer to)
//
// The script:
//   1. Creates a new test Stripe customer (metadata.organization_id = TEST_ORG_ID).
//   2. Creates a subscription with trial_period_days=0.
//   3. Waits for the webhook to fire and updates to propagate (polls the DB).
//   4. Updates subscription.cancel_at_period_end=true.
//   5. Polls DB: expects cancel_at_period_end=true, status='active'.
//   6. Updates subscription.cancel_at_period_end=false.
//   7. Polls DB: expects cancel_at_period_end=false.
//   8. Tears down: deletes the test subscription + customer.
//
// The cleanup runs even if assertions fail. The test exits non-zero on
// assertion failure.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_ORG_ID = process.env.TEST_ORG_ID;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOrg(
  supabase: any,
  orgId: string,
  predicate: (row: any) => boolean,
  description: string,
  timeoutMs = 30_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    if (data && predicate(data)) {
      console.log(`  ✓ ${description}`);
      return data;
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

async function main() {
  const stripeKey = requireEnv('STRIPE_SECRET_KEY', STRIPE_SECRET_KEY);
  const priceId = requireEnv('STRIPE_PRICE_ID', STRIPE_PRICE_ID);
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
  const orgId = requireEnv('TEST_ORG_ID', TEST_ORG_ID);

  if (!stripeKey.startsWith('sk_test_')) {
    console.error('Refusing to run: STRIPE_SECRET_KEY must be a test key (sk_test_...).');
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  try {
    console.log('1. Creating test Stripe customer...');
    const customer = await stripe.customers.create({
      name: 'Webhook Test Customer',
      email: `test+${Date.now()}@example.com`,
      metadata: { organization_id: orgId },
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });
    customerId = customer.id;
    console.log(`   customer: ${customerId}`);

    console.log('2. Creating subscription (no trial)...');
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: 0,
      metadata: { organization_id: orgId },
    });
    subscriptionId = subscription.id;
    console.log(`   subscription: ${subscriptionId}, status: ${subscription.status}`);

    console.log('3. Polling for webhook to sync subscription to org...');
    await pollOrg(
      supabase,
      orgId,
      (row) => row.stripe_subscription_id === subscriptionId && row.subscription_status === subscription.status,
      `org shows subscription ${subscriptionId} with status ${subscription.status}`,
    );

    console.log('4. Setting cancel_at_period_end = true...');
    await stripe.subscriptions.update(subscriptionId!, { cancel_at_period_end: true });
    await pollOrg(
      supabase,
      orgId,
      (row) => row.cancel_at_period_end === true,
      'org.cancel_at_period_end === true after pending cancel',
    );
    await pollOrg(
      supabase,
      orgId,
      (row) => row.subscription_status === 'active' || row.subscription_status === 'trialing',
      'org.subscription_status stays active/trialing while cancel pending',
    );

    console.log('5. Setting cancel_at_period_end = false (un-cancel)...');
    await stripe.subscriptions.update(subscriptionId!, { cancel_at_period_end: false });
    await pollOrg(
      supabase,
      orgId,
      (row) => row.cancel_at_period_end === false,
      'org.cancel_at_period_end === false after un-cancel',
    );

    console.log('\n✓ All assertions passed.');
  } catch (e) {
    console.error('\n✗ Test failed:', e);
    process.exitCode = 1;
  } finally {
    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log(`cleanup: cancelled subscription ${subscriptionId}`);
      } catch (e) {
        console.error('cleanup: failed to cancel subscription', e);
      }
    }
    if (customerId) {
      try {
        await stripe.customers.del(customerId);
        console.log(`cleanup: deleted customer ${customerId}`);
      } catch (e) {
        console.error('cleanup: failed to delete customer', e);
      }
    }
  }
}

main();
