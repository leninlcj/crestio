// Stripe webhook signature verification, extracted from the inline call in
// pages/api/stripe/webhook.ts. Pure wrapper around `Stripe.webhooks.
// constructEvent` so the verification step can be unit-tested without
// spinning up the API handler. The handler still owns the request lifecycle.

import type Stripe from 'stripe';
import { getStripe } from '../stripe';

export type VerifyResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; error: string };

// `tolerance` is the replay window in seconds. Stripe's SDK default is 300s
// (5 minutes); pass undefined to use the default, or a number to override.
export function verifyStripeWebhook(args: {
  rawBody: Buffer | string;
  signature: string;
  secret: string;
  tolerance?: number;
  // Allow tests to inject a Stripe instance instead of constructing one
  // from STRIPE_SECRET_KEY (which the unit-test environment doesn't have).
  stripe?: Stripe;
}): VerifyResult {
  try {
    const stripe = args.stripe ?? getStripe();
    const event = stripe.webhooks.constructEvent(
      args.rawBody,
      args.signature,
      args.secret,
      args.tolerance,
    );
    return { ok: true, event };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'verification failed' };
  }
}
