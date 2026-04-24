import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { REFERRAL_DISCOUNT_PERCENT } from '../../../lib/referralValidation';

// Has the caller been referred and is their pending referral still valid?
// Used by the plan picker to show the "25% off first paid month applied" badge.
// Returns { referred: false } if no pending referral exists.
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

  const { data: conv } = await admin
    .from('referral_conversions')
    .select('id, status, code_used')
    .eq('referee_user_id', userId)
    .maybeSingle();

  if (!conv) return res.status(200).json({ referred: false });
  if (conv.status !== 'pending' && conv.status !== 'converted') {
    return res.status(200).json({ referred: false });
  }

  return res.status(200).json({
    referred: true,
    status: conv.status,
    discount_percent: REFERRAL_DISCOUNT_PERCENT,
    discount_text: `${REFERRAL_DISCOUNT_PERCENT}% off your first paid month applied`,
  });
}
