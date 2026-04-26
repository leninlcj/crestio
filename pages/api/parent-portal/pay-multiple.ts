import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../../lib/rateLimit';
import { createPaymentIntentForInvoices } from '../../../lib/stripe/payments';
import { ConnectError } from '../../../lib/stripe/connect';

// POST /api/parent-portal/pay-multiple
// Parent magic-link auth. Body: { invoiceIds[], paymentMethodId? }. Creates a
// PaymentIntent for the chosen invoices on the org's connected account. If
// paymentMethodId is supplied, attempts an off-session confirm using a saved
// card (returns either succeeded, requires_action with clientSecret for 3DS,
// or fails). If omitted, behaves like the public flow and returns clientSecret
// for the parent to confirm in the browser with PaymentElement.
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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents')
    .select('id, email, name, stripe_customer_id, stripe_customer_org_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Parent account required.' });

  const rl = checkRateLimit({ key: `parent_pay:${parent.id}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as { invoiceIds?: string[]; paymentMethodId?: string | null };
  const invoiceIds = Array.isArray(body.invoiceIds)
    ? body.invoiceIds.filter((s): s is string => typeof s === 'string')
    : [];
  if (invoiceIds.length === 0) return res.status(400).json({ error: 'No invoices selected.' });

  // Authorize: every invoice must be billed to a household this parent belongs
  // to OR a student linked to this parent.
  const { data: psl } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parent.id)
    .is('revoked_at', null);
  const linkedStudentIds = new Set(((psl ?? []) as { student_id: string }[]).map((r) => r.student_id));

  const { data: hp } = await admin
    .from('household_parents')
    .select('household_id')
    .eq('parent_id', parent.id);
  const linkedHouseholdIds = new Set(((hp ?? []) as { household_id: string }[]).map((r) => r.household_id));

  const { data: invs, error: invErr } = await admin
    .from('invoices')
    .select('id, organization_id, status, household_id, student_id, total_cents')
    .in('id', invoiceIds);
  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invs || invs.length !== invoiceIds.length) {
    return res.status(404).json({ error: 'One or more invoices not found.' });
  }
  const orgIds = new Set((invs as any[]).map((i) => i.organization_id));
  if (orgIds.size !== 1) {
    return res.status(400).json({ error: 'Cannot combine invoices from different tutors.' });
  }
  for (const inv of invs as any[]) {
    const okHousehold = inv.household_id && linkedHouseholdIds.has(inv.household_id);
    const okStudent = inv.student_id && linkedStudentIds.has(inv.student_id);
    if (!okHousehold && !okStudent) {
      return res.status(403).json({ error: 'Not authorized to pay one of these invoices.' });
    }
    if (inv.status === 'paid' || inv.status === 'void') {
      return res.status(409).json({ error: 'One or more invoices is already paid.' });
    }
  }

  const orgId = (invs as any[])[0].organization_id as string;

  try {
    const result = await createPaymentIntentForInvoices({
      admin,
      orgId,
      invoiceIds,
      parentEmail: parent.email ?? null,
      parentName: parent.name ?? null,
      savePaymentMethod: false,
      parentId: parent.id,
    });

    if (body.paymentMethodId && parent.stripe_customer_id && parent.stripe_customer_org_id === orgId) {
      // Authenticated parent has a saved card on this org's connected account —
      // attach it to the PI and let the client confirm (so 3DS is interactive
      // even from the portal).
      return res.status(200).json({
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        connectedAccountId: result.connectedAccountId,
        publishableKey: result.publishableKey,
        amountTotal: result.amountTotal,
        currency: result.currency,
        savedPaymentMethodId: body.paymentMethodId,
        customerId: parent.stripe_customer_id,
      });
    }

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
    console.error('[parent-portal/pay-multiple] failed', e);
    return res.status(500).json({ error: e?.message ?? 'Failed to create payment.' });
  }
}
