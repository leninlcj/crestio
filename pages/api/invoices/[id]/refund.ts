import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { refundCharge } from '../../../../lib/stripe/payments';
import { ConnectError } from '../../../../lib/stripe/connect';

// POST /api/invoices/[id]/refund
// Owner only. Body: { amount?: cents, reason: string }. Issues a refund on the
// charge associated with this invoice. The charge.refunded webhook flips the
// invoice status back to 'sent' and updates the charges row.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only.' });
  }

  const invoiceId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!invoiceId) return res.status(400).json({ error: 'Invoice id required.' });

  const body = (req.body ?? {}) as { amount?: number; reason?: string };
  const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
    ? body.reason.trim().slice(0, 500)
    : 'requested_by_customer';
  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0
    ? Math.floor(body.amount)
    : null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, organization_id, status, total_cents, stripe_payment_intent_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if ((invoice as any).organization_id !== membership.organization_id) {
    return res.status(403).json({ error: 'Wrong org.' });
  }
  if (!(invoice as any).stripe_payment_intent_id) {
    return res.status(400).json({ error: 'Invoice has no associated payment.' });
  }
  if ((invoice as any).status !== 'paid') {
    return res.status(400).json({ error: 'Only paid invoices can be refunded.' });
  }
  if (amount !== null && amount > (invoice as any).total_cents) {
    return res.status(400).json({ error: 'Refund amount exceeds invoice total.' });
  }

  const { data: charge } = await admin
    .from('charges')
    .select('id, stripe_charge_id, amount_total, refunded_amount, status')
    .eq('stripe_payment_intent_id', (invoice as any).stripe_payment_intent_id)
    .maybeSingle();
  if (!charge?.stripe_charge_id) {
    return res.status(400).json({ error: 'No charge to refund.' });
  }
  const remaining = (charge as any).amount_total - ((charge as any).refunded_amount ?? 0);
  if (remaining <= 0) {
    return res.status(400).json({ error: 'Charge already fully refunded.' });
  }
  if (amount !== null && amount > remaining) {
    return res.status(400).json({ error: 'Refund amount exceeds remaining balance.' });
  }

  try {
    const result = await refundCharge({
      admin,
      orgId: membership.organization_id,
      stripeChargeId: (charge as any).stripe_charge_id,
      amountCents: amount,
      reason,
    });
    return res.status(200).json({ refund_id: result.refundId, refunded_amount: result.refundedAmount });
  } catch (e: any) {
    if (e instanceof ConnectError) {
      return res.status(409).json({ error: e.message, code: e.code });
    }
    console.error('[invoices/refund] failed', e);
    return res.status(500).json({ error: e?.message ?? 'Refund failed.' });
  }
}
