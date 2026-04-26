import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generateSessionsForTemplate, type SessionTemplate } from '../../../lib/sessionGeneration';

// Daily Vercel cron — for each active template, ensure 8 weeks of future
// sessions exist. generateSessionsForTemplate is idempotent (dedupes against
// existing scheduled_at) and bumps generated_through_date.
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

  const startedAt = new Date().toISOString();
  const { data: templates, error } = await admin
    .from('session_templates')
    .select('*')
    .is('cancelled_at', null);
  if (error) return res.status(500).json({ error: error.message });

  const list = (templates ?? []) as SessionTemplate[];
  let totalSessions = 0;
  let templatesProcessed = 0;
  const errors: string[] = [];

  for (const t of list) {
    try {
      // 8-week horizon per spec. The function is idempotent — re-runs cheap.
      const inserted = await generateSessionsForTemplate(admin, t, { horizonDays: 56 });
      totalSessions += inserted;
      templatesProcessed++;
    } catch (e: any) {
      errors.push(`${t.id}:${e?.message ?? 'unknown'}`);
    }
  }

  const completedAt = new Date().toISOString();
  console.info('[cron/generate-template-sessions]', JSON.stringify({
    started_at: startedAt,
    completed_at: completedAt,
    templates_total: list.length,
    templates_processed: templatesProcessed,
    sessions_generated: totalSessions,
    errors: errors.length,
  }));

  return res.status(200).json({
    ok: true,
    templates_total: list.length,
    templates_processed: templatesProcessed,
    sessions_generated: totalSessions,
    errors,
  });
}
