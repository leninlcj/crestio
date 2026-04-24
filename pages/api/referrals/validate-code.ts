import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { normaliseCode, isWellFormedCode } from '../../../lib/referralCode';
import { lookupReferrerByCode, REFERRAL_DISCOUNT_PERCENT } from '../../../lib/referralValidation';

// Public endpoint — no auth. Used during signup / landing page.
// Returns a minimal response so we don't leak referrer identity.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const raw = typeof req.body?.code === 'string' ? req.body.code : '';
  const code = normaliseCode(raw);
  if (!code || !isWellFormedCode(code)) {
    return res.status(200).json({ valid: false });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const result = await lookupReferrerByCode(admin, code);
  if (!result.ok) {
    return res.status(200).json({ valid: false });
  }

  return res.status(200).json({
    valid: true,
    discount_text: `${REFERRAL_DISCOUNT_PERCENT}% off your first paid month`,
    referrer_name_hint: 'Referred by a Crestio user',
  });
}
