import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { countryToCurrency, countryToLocale, isSupportedCurrency } from '../../../lib/currency';
import { isSupportedLocale } from '../../../lib/i18n';

// POST /api/onboarding/detect-region
// Called once, right after signup. Reads x-vercel-ip-country, derives the
// tutor's invoicing currency + preferred locale, and writes them to the
// tutor's organization and profile. Idempotent — safe to call again; only
// overwrites fields that are still at their default value.
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
  const userId = userData.user.id;

  // Vercel injects this header at the edge; in local dev it's absent.
  const headerCountry = req.headers['x-vercel-ip-country'];
  const countryCode = typeof headerCountry === 'string' && headerCountry.length === 2
    ? headerCountry.toUpperCase()
    : null;

  // Accept a body.country override so the client can pass a test value from
  // dev, or let the user correct Vercel's guess on signup.
  const bodyCountry = typeof (req.body as any)?.country === 'string'
    ? ((req.body as any).country as string).toUpperCase()
    : null;
  const effectiveCountry = bodyCountry || countryCode;
  const currency = countryToCurrency(effectiveCountry);
  const locale = countryToLocale(effectiveCountry);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('locale, organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.organization_id) {
    return res.status(200).json({ ok: false, reason: 'no_org_yet' });
  }

  // Only overwrite defaults — respect any preference the user set manually.
  if (!profile.locale || profile.locale === 'en') {
    await admin.from('profiles').update({ locale }).eq('id', userId);
  }

  const { data: org } = await admin
    .from('organizations')
    .select('currency, country_code')
    .eq('id', profile.organization_id)
    .maybeSingle();
  if (org) {
    const update: Record<string, unknown> = {};
    if (!org.country_code && effectiveCountry) update.country_code = effectiveCountry;
    if ((!org.currency || org.currency === 'AUD') && isSupportedCurrency(currency) && currency !== 'AUD') {
      update.currency = currency;
    }
    if (Object.keys(update).length > 0) {
      await admin.from('organizations').update(update).eq('id', profile.organization_id);
    }
  }

  return res.status(200).json({
    ok: true,
    country: effectiveCountry,
    currency,
    locale: isSupportedLocale(locale) ? locale : 'en',
  });
}
