import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../../../lib/rateLimit';
import { createPaymentIntentForInvoices } from '../../../../lib/stripe/payments';
import { ConnectError } from '../../../../lib/stripe/connect';

// POST /api/pay/[token]/intent
// Public — no auth. Body: { savePaymentMethod?, parentEmail?, parentName?,
// additionalTokens?: string[] }. Returns { clientSecret, publishableKey,
// connectedAccountId, paymentIntentId, amountTotal, currency }.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ip = fwd.split(',')[0]?.trim() || (req.socket.remoteAddress ?? 'unknown');
  const rl = checkRateLimit({ key: `pay_intent:${ip}`, limit: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const tokenParam = typeof req.query.token === 'string' ? req.query.token : '';
  if (!tokenParam || tokenParam.length < 16) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const body = (req.body ?? {}) as {
    savePaymentMethod?: boolean;
    parentEmail?: string | null;
    parentName?: string | null;
    additionalTokens?: string[];
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const tokens = [tokenParam, ...(Array.isArray(body.additionalTokens) ? body.additionalTokens : [])];
  const uniqueTokens = Array.from(new Set(tokens.filter((t) => typeof t === 'string' && t.length >= 16)));

  const { data: invoices, error: invErr } = await admin
    .from('invoices')
    .select('id, organization_id, status, total_cents, payment_token')
    .in('payment_token', uniqueTokens);
  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoices || invoices.length !== uniqueTokens.length) {
    return res.status(404).json({ error: 'One or more invoices not found.' });
  }

  const orgIds = new Set(invoices.map((i: any) => i.organization_id));
  if (orgIds.size !== 1) {
    return res.status(400).json({ error: 'Cannot combine invoices from different tutors.' });
  }
  const orgId = invoices[0].organization_id as string;

  for (const inv of invoices as any[]) {
    if (inv.status === 'paid' || inv.status === 'void') {
      return res.status(409).json({ error: 'One or more invoices is already paid or void.' });
    }
  }

  try {
    const result = await createPaymentIntentForInvoices({
      admin,
      orgId,
      invoiceIds: (invoices as any[]).map((i) => i.id),
      parentEmail: body.parentEmail ?? null,
      parentName: body.parentName ?? null,
      savePaymentMethod: Boolean(body.savePaymentMethod),
    });
    return res.status(200).json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      connectedAccountId: result.connectedAccountId,
      publishableKey: result.publishableKey,
      amountTotal: result.amountTotal,
      currency: result.currency,
    });
  } catch (e: any) {
    if (e instanceof ConnectError) {
      return res.status(409).json({ error: e.message, code: e.code });
    }
    console.error('[pay/intent] failed', e);
    return res.status(500).json({ error: e?.message ?? 'Failed to create payment.' });
  }
}
