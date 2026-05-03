// Stripe mock with the surface area used by lib/stripe/* and the webhook
// handlers — paymentIntents, accounts, customers, refunds, transfers, plus
// `webhooks.constructEvent`. By default `constructEvent` returns the body
// parsed as JSON, but you can override per test for invalid-sig / replay
// scenarios via `__failConstructEvent`.

import { vi } from 'vitest';

export type MockStripeOptions = {
  failConstructEvent?: Error | null;
};

export function createMockStripe(opts: MockStripeOptions = {}) {
  const state = {
    failConstructEvent: opts.failConstructEvent ?? null as Error | null,
  };

  const paymentIntents = {
    create: vi.fn(async (params: any, _options?: any) => ({
      id: 'pi_mock_' + Math.random().toString(36).slice(2, 8),
      client_secret: 'pi_mock_secret',
      amount: params.amount,
      currency: params.currency,
      application_fee_amount: params.application_fee_amount ?? 0,
      status: 'requires_payment_method',
      metadata: params.metadata ?? {},
    })),
    retrieve: vi.fn(async (id: string) => ({ id, status: 'succeeded' })),
  };

  const accounts = {
    create: vi.fn(async (params: any) => ({
      id: 'acct_mock_' + Math.random().toString(36).slice(2, 8),
      type: params.type ?? 'express',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    })),
    retrieve: vi.fn(async (id: string) => ({
      id,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    })),
    createLoginLink: vi.fn(async (id: string) => ({ url: `https://stripe.test/login/${id}` })),
  };

  const accountLinks = {
    create: vi.fn(async (_params: any) => ({ url: 'https://stripe.test/onboard' })),
  };

  const customers = {
    create: vi.fn(async (params: any) => ({
      id: 'cus_mock_' + Math.random().toString(36).slice(2, 8),
      email: params.email,
      name: params.name,
    })),
  };

  const refunds = {
    create: vi.fn(async (params: any) => ({
      id: 're_mock',
      amount: params.amount ?? 0,
      charge: params.charge,
      status: 'succeeded',
    })),
  };

  const transfers = {
    create: vi.fn(async (params: any) => ({
      id: 'tr_mock',
      amount: params.amount,
      destination: params.destination,
      currency: params.currency,
    })),
  };

  const webhooks = {
    constructEvent: vi.fn((rawBody: Buffer | string, _signature: string, _secret: string) => {
      if (state.failConstructEvent) throw state.failConstructEvent;
      const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON in webhook body');
      }
    }),
  };

  const checkout = {
    sessions: {
      create: vi.fn(async (params: any) => ({
        id: 'cs_mock',
        url: 'https://stripe.test/checkout/cs_mock',
        client_reference_id: params.client_reference_id,
      })),
      retrieve: vi.fn(async (id: string) => ({ id, payment_status: 'paid' })),
    },
  };

  const billingPortal = {
    sessions: {
      create: vi.fn(async () => ({ url: 'https://stripe.test/portal' })),
    },
  };

  return {
    paymentIntents,
    accounts,
    accountLinks,
    customers,
    refunds,
    transfers,
    webhooks,
    checkout,
    billingPortal,
    __setConstructEventError(err: Error | null) { state.failConstructEvent = err; },
  };
}

export type MockStripe = ReturnType<typeof createMockStripe>;

// Build a minimal valid Stripe webhook signature header — the test webhook
// verifier in lib/stripe/webhook-verify.ts uses Stripe's real
// constructEvent, so for unit tests we rely on the SDK's
// `Stripe.webhooks.generateTestHeaderString`. This helper wraps that.
export function buildTestStripeSignatureHeader(args: {
  payload: string;
  secret: string;
  timestamp?: number;
  StripeCtor: any;
}): string {
  return args.StripeCtor.webhooks.generateTestHeaderString({
    payload: args.payload,
    secret: args.secret,
    timestamp: args.timestamp,
  });
}
