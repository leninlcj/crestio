import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import { verifyStripeWebhook } from '@/lib/stripe/webhookVerify';

// Use a real Stripe instance configured against a fake key — `webhooks.
// constructEvent` doesn't make network calls, just HMAC-verifies. We pass it
// directly via the `stripe` arg so we don't depend on STRIPE_SECRET_KEY in
// the test environment.
const stripe = new Stripe('sk_test_fake_for_unit_tests', {
  apiVersion: '2024-06-20' as any,
});

const SECRET = 'whsec_test_secret_for_unit_tests';

const eventPayload = JSON.stringify({
  id: 'evt_test_1',
  object: 'event',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_test_1', amount: 5000 } },
});

function sign(timestamp: number) {
  return stripe.webhooks.generateTestHeaderString({
    payload: eventPayload,
    secret: SECRET,
    timestamp,
  });
}

describe('verifyStripeWebhook', () => {
  it('accepts a payload with a valid signature within the default 5-minute window', () => {
    const sig = sign(Math.floor(Date.now() / 1000));
    const result = verifyStripeWebhook({
      rawBody: eventPayload,
      signature: sig,
      secret: SECRET,
      stripe,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe('evt_test_1');
      expect(result.event.type).toBe('payment_intent.succeeded');
    }
  });

  it('rejects a tampered body (signature was computed for a different payload)', () => {
    const sig = sign(Math.floor(Date.now() / 1000));
    const tampered = eventPayload.replace('5000', '50000000');
    const result = verifyStripeWebhook({
      rawBody: tampered,
      signature: sig,
      secret: SECRET,
      stripe,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no signatures found|signature/i);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const sig = sign(Math.floor(Date.now() / 1000));
    const result = verifyStripeWebhook({
      rawBody: eventPayload,
      signature: sig,
      secret: 'whsec_wrong_secret',
      stripe,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    const result = verifyStripeWebhook({
      rawBody: eventPayload,
      signature: 'not-a-real-stripe-signature',
      secret: SECRET,
      stripe,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a replay older than the tolerance window (5 minutes)', () => {
    // 6 minutes in the past — outside the default 300s tolerance.
    const sig = sign(Math.floor(Date.now() / 1000) - 6 * 60);
    const result = verifyStripeWebhook({
      rawBody: eventPayload,
      signature: sig,
      secret: SECRET,
      tolerance: 300,
      stripe,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timestamp|tolerance|outside/i);
  });

  it('accepts an old signature when tolerance is widened (proves the param is wired through)', () => {
    const sig = sign(Math.floor(Date.now() / 1000) - 6 * 60);
    const result = verifyStripeWebhook({
      rawBody: eventPayload,
      signature: sig,
      secret: SECRET,
      tolerance: 24 * 60 * 60, // 1 day
      stripe,
    });
    expect(result.ok).toBe(true);
  });
});
