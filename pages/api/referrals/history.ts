import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Per-row referral + credit history for the Referrals dashboard. Separated
// from /me so /me can be called cheaply (signup pre-flight, badge checks).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: conversions } = await admin
    .from('referral_conversions')
    .select('id, status, referee_signed_up_at, referee_converted_at, rejection_reason')
    .eq('referrer_user_id', userId)
    .order('referee_signed_up_at', { ascending: false })
    .limit(20);

  // Fetch credits issued to THIS user that came from a referral_bonus (i.e.
  // credits earned by referring others) so we can attach amounts to rows.
  const { data: bonusCredits } = await admin
    .from('account_credits')
    .select('source_reference, amount_cents, applied_at, stripe_invoice_id')
    .eq('user_id', userId)
    .eq('source', 'referral_bonus');

  const bonusByConv = new Map<string, { amount_cents: number; applied_at: string | null; stripe_invoice_id: string | null }>();
  for (const c of (bonusCredits ?? []) as any[]) {
    if (c.source_reference) {
      bonusByConv.set(c.source_reference, {
        amount_cents: c.amount_cents,
        applied_at: c.applied_at,
        stripe_invoice_id: c.stripe_invoice_id,
      });
    }
  }

  const history = ((conversions ?? []) as any[]).map((c) => ({
    id: c.id,
    status: c.status,
    signed_up_at: c.referee_signed_up_at,
    converted_at: c.referee_converted_at,
    rejection_reason: c.rejection_reason,
    credit_earned_cents: bonusByConv.get(c.id)?.amount_cents ?? null,
  }));

  // Credit history (all sources, not just referrals).
  const { data: credits } = await admin
    .from('account_credits')
    .select('id, amount_cents, currency, source, issued_at, expires_at, applied_at, stripe_invoice_id')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })
    .limit(50);

  return res.status(200).json({
    conversions: history,
    credits: credits ?? [],
  });
}
