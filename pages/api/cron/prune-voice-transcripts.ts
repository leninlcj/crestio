import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron → GET this endpoint daily at 02:00 UTC (see vercel.json).
// Deletes voice_transcriptions rows older than 30 days.
//
// Protected by CRON_SECRET — Vercel Cron sends the exact header
// `Authorization: Bearer <CRON_SECRET>`. Non-cron callers can't access it.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/prune-voice-transcripts] CRON_SECRET missing');
    return res.status(500).json({ error: 'Cron not configured.' });
  }
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('voice_transcriptions')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)
    .select('id');
  if (error) {
    console.error('[cron/prune-voice-transcripts] delete failed', error);
    return res.status(500).json({ error: error.message });
  }
  const pruned = data?.length ?? 0;
  console.info('[cron/prune-voice-transcripts] pruned rows:', pruned);
  return res.status(200).json({ ok: true, pruned });
}
