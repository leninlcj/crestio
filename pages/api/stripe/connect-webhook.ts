import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { syncConnectAccountStatus } from '../../../lib/stripe/connect';
import {
  applyChargeRefund,
  markInvoicesPaid,
  recordPaymentFailure,
} from '../../../lib/stripe/payments';
import { sendEmail } from '../../../lib/email';
import { buildPaymentReceiptEmail } from '../../../lib/emails/paymentReceipt';
import { buildRefundConfirmationEmail } from '../../../lib/emails/refundConfirmation';
import { buildPaymentFailedEmail } from '../../../lib/emails/paymentFailed';

export const config = { api: { bodyParser: false } };

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('[connect-webhook] read body failed', e);
    return res.status(400).json({ error: 'Could not read body.' });
  }
  if (!webhookSecret) {
    console.warn('[connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET not set, acknowledging without verification');
    return res.status(200).json({ received: true, verified: false });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing signature.' });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('[connect-webhook] signature failed', err?.message);
    return res.status(400).json({ error: `Signature failed: ${err?.message}` });
  }

  const admin = getAdmin();
  if (!admin) {
    console.error('[connect-webhook] missing service role, skipping persist');
    return res.status(200).json({ received: true, persisted: false });
  }

  // Resolve org from event.account (the connected Stripe account) for the
  // audit log foreign key.
  let eventOrgId: string | null = null;
  if (event.account) {
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('stripe_connect_account_id', event.account)
      .maybeSingle();
    eventOrgId = (data?.id as string | undefined) ?? null;
  }

  // Idempotent log: insert into billing_events on conflict do nothing.
  await admin
    .from('billing_events')
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        organization_id: eventOrgId,
        payload: event as any,
      },
      { onConflict: 'stripe_event_id', ignoreDuplicates: true },
    );

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await syncConnectAccountStatus(admin, account.id);
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        // We need the latest_charge expanded to compute fees; refetch on the
        // connected account (event.account is the connected account id).
        const acct = event.account;
        const expanded = acct
          ? await stripe.paymentIntents.retrieve(
              pi.id,
              { expand: ['latest_charge.balance_transaction', 'latest_charge.payment_method_details'] },
              { stripeAccount: acct },
            )
          : pi;
        await markInvoicesPaid(admin, expanded);
        await sendReceiptEmail(admin, expanded).catch((e) => console.error('[connect-webhook] receipt email failed', e));
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await recordPaymentFailure(admin, pi);
        // Distinguish real failure from 3DS pending: payment_failed only fires
        // for hard failures, so notify the tutor.
        await sendTutorPaymentFailedEmail(admin, pi).catch((e) =>
          console.error('[connect-webhook] tutor failure email failed', e),
        );
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await applyChargeRefund(admin, charge);
        await sendRefundEmail(admin, charge).catch((e) => console.error('[connect-webhook] refund email failed', e));
        break;
      }
      case 'payout.paid':
      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout;
        console.log('[connect-webhook] payout', {
          id: payout.id,
          status: payout.status,
          amount: payout.amount,
          arrival: payout.arrival_date,
          account: event.account,
        });
        break;
      }
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error('[connect-webhook] handler error', e);
    return res.status(500).json({ error: e?.message ?? 'Webhook handler failed.' });
  }
}

async function sendReceiptEmail(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const orgId = pi.metadata?.organization_id;
  const invoiceIdsCsv = pi.metadata?.invoice_ids;
  const parentEmail = pi.metadata?.parent_email || pi.receipt_email;
  if (!orgId || !invoiceIdsCsv || !parentEmail) return;
  const invoiceIds = invoiceIdsCsv.split(',').map((s) => s.trim()).filter(Boolean);

  const [{ data: org }, { data: invoices }] = await Promise.all([
    admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    admin
      .from('invoices')
      .select('id, number, total_cents, currency')
      .in('id', invoiceIds),
  ]);

  const charge = pi.latest_charge as Stripe.Charge | null | undefined;
  const card = (typeof charge === 'object' ? charge : null)?.payment_method_details?.card;
  const built = buildPaymentReceiptEmail({
    practiceName: (org as any)?.name ?? 'your tutor',
    parentEmail,
    invoiceNumbers: ((invoices ?? []) as any[]).map((i) => i.number).join(', '),
    amountCents: pi.amount,
    currency: (pi.currency || 'aud').toUpperCase(),
    paidAtLabel: new Date(pi.created * 1000).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
  });
  await sendEmail({ to: parentEmail, subject: built.subject, html: built.html, text: built.text });
}

async function sendRefundEmail(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  charge: Stripe.Charge,
): Promise<void> {
  const { data: chargeRow } = await admin
    .from('charges')
    .select('organization_id, invoice_ids, amount_total, refunded_amount')
    .eq('stripe_charge_id', charge.id)
    .maybeSingle();
  if (!chargeRow) return;
  const parentEmail = charge.billing_details?.email || charge.receipt_email;
  if (!parentEmail) return;

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', (chargeRow as any).organization_id)
    .maybeSingle();
  const { data: invoices } = await admin
    .from('invoices')
    .select('number, currency')
    .in('id', (chargeRow as any).invoice_ids ?? []);

  const built = buildRefundConfirmationEmail({
    practiceName: (org as any)?.name ?? 'your tutor',
    invoiceNumbers: ((invoices ?? []) as any[]).map((i) => i.number).join(', '),
    refundedAmountCents: charge.amount_refunded,
    currency: (charge.currency || 'aud').toUpperCase(),
    refundedAtLabel: new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  });
  await sendEmail({ to: parentEmail, subject: built.subject, html: built.html, text: built.text });
}

async function sendTutorPaymentFailedEmail(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const orgId = pi.metadata?.organization_id;
  if (!orgId) return;
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, owner_user_id')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return;
  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('email, owner_name')
    .eq('id', (org as any).owner_user_id)
    .maybeSingle();
  if (!ownerProfile?.email) return;

  const built = buildPaymentFailedEmail({
    ownerName: (ownerProfile as any).owner_name ?? null,
    practiceName: (org as any).name ?? 'your practice',
    invoiceNumbers: pi.metadata?.invoice_numbers ?? pi.metadata?.invoice_ids ?? '',
    amountCents: pi.amount,
    currency: (pi.currency || 'aud').toUpperCase(),
    failureCode: pi.last_payment_error?.code ?? null,
    failureMessage: pi.last_payment_error?.message ?? null,
  });
  await sendEmail({
    to: (ownerProfile as any).email,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
}
