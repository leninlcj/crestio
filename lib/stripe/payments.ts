// PaymentIntent creation, mark-paid, and refund flow for Connect direct
// charges. Direct charges live on the connected account; the platform
// extracts an application_fee_amount per PaymentIntent.
//
// Fee math (configurable in calculateFees):
//   applicationFee = max(50, ceil(amount * 0.01))     // 1% with $0.50 floor
//
// Stripe's processing fee (2.9% + 30c domestic AU) is taken from the
// connected account's balance separately and is not part of application_fee.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import crypto from 'crypto';
import { getStripe } from '../stripe';
import { ConnectError, getOrgWithConnect } from './connect';

export type FeeBreakdown = {
  amountTotal: number;
  applicationFee: number;
};

export function calculateFees(amountCents: number): FeeBreakdown {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { amountTotal: amountCents, applicationFee: 0 };
  }
  const applicationFee = Math.max(50, Math.ceil(amountCents * 0.01));
  return { amountTotal: amountCents, applicationFee };
}

type InvoiceForPayment = {
  id: string;
  organization_id: string;
  total_cents: number;
  currency: string;
  status: string;
  payment_token: string | null;
  number: string;
};

async function loadInvoices(
  admin: SupabaseClient,
  orgId: string,
  invoiceIds: string[],
): Promise<InvoiceForPayment[]> {
  const { data, error } = await admin
    .from('invoices')
    .select('id, organization_id, total_cents, currency, status, payment_token, number')
    .in('id', invoiceIds);
  if (error) throw new Error(`Failed to load invoices: ${error.message}`);
  const rows = (data ?? []) as InvoiceForPayment[];
  if (rows.length !== invoiceIds.length) {
    throw new Error('Some invoices were not found.');
  }
  for (const r of rows) {
    if (r.organization_id !== orgId) {
      throw new Error('Invoice does not belong to this organization.');
    }
    if (r.status === 'paid' || r.status === 'void') {
      throw new Error(`Invoice ${r.number} cannot be paid (status: ${r.status}).`);
    }
    if (r.total_cents <= 0) {
      throw new Error(`Invoice ${r.number} has no amount due.`);
    }
  }
  // Multi-invoice: enforce single currency across the cart.
  const currencies = new Set(rows.map((r) => r.currency || 'AUD'));
  if (currencies.size > 1) {
    throw new Error('Cannot combine invoices in different currencies.');
  }
  return rows;
}

async function ensureCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  orgId: string,
  connectedAccountId: string,
  parentEmail: string,
  parentName: string | null,
): Promise<{ customerId: string; parentId: string | null }> {
  // Find a parent record by email if one exists.
  const { data: parent } = await admin
    .from('parents')
    .select('id, stripe_customer_id, stripe_customer_org_id')
    .eq('email', parentEmail)
    .maybeSingle();

  // If we already have a customer for this (parent, org) pair, reuse it.
  if (parent?.stripe_customer_id && parent.stripe_customer_org_id === orgId) {
    return { customerId: parent.stripe_customer_id, parentId: parent.id as string };
  }

  const customer = await stripe.customers.create(
    {
      email: parentEmail,
      name: parentName ?? undefined,
      metadata: { organization_id: orgId, parent_id: parent?.id ?? '' },
    },
    { stripeAccount: connectedAccountId },
  );

  if (parent?.id) {
    await admin
      .from('parents')
      .update({ stripe_customer_id: customer.id, stripe_customer_org_id: orgId })
      .eq('id', parent.id);
  }
  return { customerId: customer.id, parentId: (parent?.id as string | undefined) ?? null };
}

export async function createPaymentIntentForInvoices(opts: {
  admin: SupabaseClient;
  orgId: string;
  invoiceIds: string[];
  parentEmail?: string | null;
  parentName?: string | null;
  savePaymentMethod?: boolean;
  parentId?: string | null;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  connectedAccountId: string;
  publishableKey: string;
  amountTotal: number;
  currency: string;
}> {
  const org = await getOrgWithConnect(opts.admin, opts.orgId);
  if (!org) throw new ConnectError('Organization not found.', 'org_not_found');
  if (!org.stripe_connect_account_id) {
    throw new ConnectError('This tutor has not finished payment setup.', 'connect_missing');
  }
  if (!org.stripe_connect_charges_enabled) {
    throw new ConnectError('Payments are not yet enabled for this tutor.', 'charges_disabled');
  }

  const invoices = await loadInvoices(opts.admin, opts.orgId, opts.invoiceIds);
  const total = invoices.reduce((a, i) => a + i.total_cents, 0);
  if (total <= 0) throw new Error('Nothing to charge.');

  const currency = (invoices[0].currency || org.currency || 'AUD').toLowerCase();
  const fees = calculateFees(total);

  const stripe = getStripe();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new ConnectError('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured.', 'publishable_missing');
  }

  let customerId: string | null = null;
  let parentId: string | null = opts.parentId ?? null;
  if (opts.savePaymentMethod && opts.parentEmail) {
    const c = await ensureCustomer(
      opts.admin,
      stripe,
      opts.orgId,
      org.stripe_connect_account_id,
      opts.parentEmail,
      opts.parentName ?? null,
    );
    customerId = c.customerId;
    parentId = parentId ?? c.parentId;
  }

  const idempotencyKey = `pi_${opts.orgId}_${invoices
    .map((i) => i.id)
    .sort()
    .join('_')}_${crypto
    .createHash('sha256')
    .update(`${total}:${opts.parentEmail ?? ''}:${opts.savePaymentMethod ? 1 : 0}`)
    .digest('hex')
    .slice(0, 16)}`;

  const params: Stripe.PaymentIntentCreateParams = {
    amount: total,
    currency,
    automatic_payment_methods: { enabled: true },
    application_fee_amount: fees.applicationFee,
    receipt_email: opts.parentEmail ?? undefined,
    description: invoices.length === 1
      ? `Invoice ${invoices[0].number}`
      : `${invoices.length} invoices: ${invoices.map((i) => i.number).join(', ')}`,
    metadata: {
      organization_id: opts.orgId,
      invoice_ids: invoices.map((i) => i.id).join(','),
      invoice_numbers: invoices.map((i) => i.number).join(','),
      parent_id: parentId ?? '',
      parent_email: opts.parentEmail ?? '',
    },
  };
  if (customerId) {
    params.customer = customerId;
    if (opts.savePaymentMethod) {
      params.setup_future_usage = 'off_session';
    }
  }

  const pi = await stripe.paymentIntents.create(params, {
    idempotencyKey,
    stripeAccount: org.stripe_connect_account_id,
  });

  return {
    clientSecret: pi.client_secret ?? '',
    paymentIntentId: pi.id,
    connectedAccountId: org.stripe_connect_account_id,
    publishableKey,
    amountTotal: total,
    currency,
  };
}

// Atomic-ish: marks every invoice in the PI's metadata paid, persists fee
// breakdown, upserts the charges row. Idempotent via the unique
// stripe_payment_intent_id constraint on charges.
export async function markInvoicesPaid(
  admin: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const orgId = paymentIntent.metadata?.organization_id;
  const invoiceIdsCsv = paymentIntent.metadata?.invoice_ids;
  if (!orgId || !invoiceIdsCsv) {
    console.warn('[stripe/payments] PI missing metadata', { id: paymentIntent.id });
    return;
  }
  const invoiceIds = invoiceIdsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (invoiceIds.length === 0) return;

  const charge = (paymentIntent.latest_charge as Stripe.Charge | string | null);
  const chargeObj = typeof charge === 'object' && charge !== null ? charge : null;
  const stripeChargeId = chargeObj?.id ?? (typeof charge === 'string' ? charge : null);
  const stripeFee = chargeObj?.balance_transaction
    ? typeof chargeObj.balance_transaction === 'object'
      ? (chargeObj.balance_transaction.fee as number | null)
      : null
    : null;
  const pmDetails = chargeObj?.payment_method_details?.card ?? null;
  const brand = pmDetails?.brand ?? null;
  const last4 = pmDetails?.last4 ?? null;

  const applicationFee = paymentIntent.application_fee_amount ?? 0;
  const stripeFeeAmount = typeof stripeFee === 'number' ? stripeFee : null;
  const netToOrg =
    paymentIntent.amount -
    applicationFee -
    (typeof stripeFeeAmount === 'number' ? stripeFeeAmount : 0);

  // Per-invoice share — split the platform/Stripe fee proportionally.
  const { data: invRows } = await admin
    .from('invoices')
    .select('id, total_cents')
    .in('id', invoiceIds);
  const totalInv = ((invRows ?? []) as { id: string; total_cents: number }[]).reduce(
    (a, r) => a + r.total_cents,
    0,
  );
  const shares = new Map<string, { platform: number; stripe: number; net: number }>();
  for (const r of (invRows ?? []) as { id: string; total_cents: number }[]) {
    const ratio = totalInv > 0 ? r.total_cents / totalInv : 0;
    const platformShare = Math.round(applicationFee * ratio);
    const stripeShare = Math.round((stripeFeeAmount ?? 0) * ratio);
    shares.set(r.id, {
      platform: platformShare,
      stripe: stripeShare,
      net: r.total_cents - platformShare - stripeShare,
    });
  }

  const paidAt = paymentIntent.created
    ? new Date(paymentIntent.created * 1000).toISOString()
    : new Date().toISOString();

  // Update each invoice row.
  for (const id of invoiceIds) {
    const share = shares.get(id);
    const update: Record<string, unknown> = {
      status: 'paid',
      paid_at: paidAt,
      stripe_payment_intent_id: paymentIntent.id,
      payment_method_brand: brand,
      payment_method_last4: last4,
      platform_fee_amount: share?.platform ?? null,
      stripe_fee_amount: share?.stripe ?? null,
      net_amount_to_org: share?.net ?? null,
    };
    const { error } = await admin.from('invoices').update(update).eq('id', id);
    if (error) console.error('[stripe/payments] invoice update failed', { id, error: error.message });
  }

  // Upsert charge row. Conflict target: stripe_payment_intent_id.
  const parentIdFromMeta = paymentIntent.metadata?.parent_id;
  const chargeRow = {
    organization_id: orgId,
    invoice_ids: invoiceIds,
    parent_id: parentIdFromMeta && parentIdFromMeta.length > 0 ? parentIdFromMeta : null,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id: stripeChargeId,
    amount_total: paymentIntent.amount,
    amount_application_fee: applicationFee,
    amount_stripe_fee: stripeFeeAmount,
    amount_net: netToOrg,
    currency: paymentIntent.currency,
    status: paymentIntent.status === 'succeeded' ? 'succeeded' : paymentIntent.status,
    payment_method_brand: brand,
    payment_method_last4: last4,
  };
  const { error: cErr } = await admin
    .from('charges')
    .upsert(chargeRow, { onConflict: 'stripe_payment_intent_id' });
  if (cErr) console.error('[stripe/payments] charge upsert failed', { id: paymentIntent.id, error: cErr.message });
}

export async function recordPaymentFailure(
  admin: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const orgId = paymentIntent.metadata?.organization_id;
  const invoiceIdsCsv = paymentIntent.metadata?.invoice_ids;
  if (!orgId || !invoiceIdsCsv) return;
  const invoiceIds = invoiceIdsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const lastErr = paymentIntent.last_payment_error;
  const parentIdFromMeta = paymentIntent.metadata?.parent_id;

  const row = {
    organization_id: orgId,
    invoice_ids: invoiceIds,
    parent_id: parentIdFromMeta && parentIdFromMeta.length > 0 ? parentIdFromMeta : null,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id:
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id ?? null,
    amount_total: paymentIntent.amount,
    amount_application_fee: paymentIntent.application_fee_amount ?? 0,
    amount_stripe_fee: null,
    amount_net: 0,
    currency: paymentIntent.currency,
    status: 'failed',
    failure_code: lastErr?.code ?? null,
    failure_message: lastErr?.message ?? null,
  };
  const { error } = await admin
    .from('charges')
    .upsert(row, { onConflict: 'stripe_payment_intent_id' });
  if (error) console.error('[stripe/payments] failure upsert failed', { id: paymentIntent.id, error: error.message });
}

export async function refundCharge(opts: {
  admin: SupabaseClient;
  orgId: string;
  stripeChargeId: string;
  amountCents: number | null;
  reason: string;
}): Promise<{ refundId: string; refundedAmount: number }> {
  const org = await getOrgWithConnect(opts.admin, opts.orgId);
  if (!org?.stripe_connect_account_id) {
    throw new ConnectError('Org has no Connect account.', 'connect_missing');
  }
  const stripe = getStripe();
  const idempotencyKey = `refund_${opts.stripeChargeId}_${opts.amountCents ?? 'full'}`;
  const refund = await stripe.refunds.create(
    {
      charge: opts.stripeChargeId,
      amount: opts.amountCents ?? undefined,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { organization_id: opts.orgId, reason: opts.reason },
    },
    { idempotencyKey, stripeAccount: org.stripe_connect_account_id },
  );
  return { refundId: refund.id, refundedAmount: refund.amount };
}

export async function applyChargeRefund(
  admin: SupabaseClient,
  chargeObj: Stripe.Charge,
): Promise<void> {
  const refundedAmount = chargeObj.amount_refunded ?? 0;
  const fullyRefunded = chargeObj.refunded === true;
  const status = fullyRefunded ? 'refunded' : refundedAmount > 0 ? 'partially_refunded' : 'succeeded';

  const { data: row } = await admin
    .from('charges')
    .select('id, invoice_ids')
    .eq('stripe_charge_id', chargeObj.id)
    .maybeSingle();

  if (row) {
    await admin
      .from('charges')
      .update({ refunded_amount: refundedAmount, status })
      .eq('id', row.id);

    const invoiceIds = (row as { invoice_ids: string[] }).invoice_ids ?? [];
    if (fullyRefunded && invoiceIds.length > 0) {
      // Mark each invoice as 'sent' again so the org can re-collect or void.
      await admin
        .from('invoices')
        .update({ status: 'sent', paid_at: null })
        .in('id', invoiceIds);
    }
  }
}
