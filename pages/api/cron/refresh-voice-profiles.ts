import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { rebuildProfileForTutor } from '../../../lib/voice/sample';

// Daily Vercel cron — refreshes voice profiles for tutors who:
//   - have at least 10 accepted samples
//   - whose profile is older than 7 days (or has never been built)
//   - have been active in the last 30 days (any accepted sample)
//
// Idempotent: if the profile is fresh enough we skip. Failures are recorded
// in the response payload so the cron retries on the next run.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: candErr } = await admin
    .from('profiles')
    .select('id, organization_id, voice_profile_summary, voice_profile_updated_at, voice_profile_sample_count')
    .gte('voice_profile_sample_count', 10)
    .or(`voice_profile_updated_at.is.null,voice_profile_updated_at.lt.${sevenDaysAgo}`);

  if (candErr) {
    console.error('[cron/refresh-voice-profiles] candidate query failed', candErr);
    return res.status(500).json({ error: candErr.message });
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const profile of (candidates ?? []) as any[]) {
    if (!profile.organization_id) { skipped++; continue; }

    // Active-in-30-days check.
    const { count: recent } = await admin
      .from('tutor_voice_samples')
      .select('id', { count: 'exact', head: true })
      .eq('tutor_user_id', profile.id)
      .eq('accepted', true)
      .gte('created_at', thirtyDaysAgo);
    if ((recent ?? 0) === 0) { skipped++; continue; }

    try {
      const result = await rebuildProfileForTutor(admin, profile.id, profile.organization_id);
      if (result) refreshed++;
      else skipped++;
    } catch (err) {
      failed++;
      errors.push(`${profile.id}: ${(err as Error).message}`);
    }
  }

  return res.status(200).json({
    ok: true,
    candidates: (candidates ?? []).length,
    refreshed,
    skipped,
    failed,
    errors,
    ran_at: new Date().toISOString(),
  });
}
