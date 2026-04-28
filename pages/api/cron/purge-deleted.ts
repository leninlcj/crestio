import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron → daily at 03:00 UTC.
// Hard-deletes rows where deleted_at < now() - 30 days.
// Tables covered:
//   sessions, invoices (only when status='void'), files, lesson_plans, messages
// Archived rows are NEVER auto-purged — they live in Trash forever until the
// owner explicitly purges them.

const PURGE_TABLES = [
  { table: 'sessions',      extra: '' },
  { table: 'lesson_plans',  extra: '' },
  { table: 'files',         extra: '' },
  { table: 'messages',      extra: '' },
];

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

  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const startedAt = new Date().toISOString();
  const summary: Record<string, number> = {};
  const errors: string[] = [];

  for (const { table } of PURGE_TABLES) {
    try {
      const { data, error } = await admin
        .from(table)
        .delete()
        .lt('deleted_at', cutoff)
        .select('id');
      if (error) {
        errors.push(`${table}:${error.message}`);
        summary[table] = 0;
      } else {
        summary[table] = data?.length ?? 0;
      }
    } catch (e: any) {
      errors.push(`${table}:${e?.message ?? 'unknown'}`);
      summary[table] = 0;
    }
  }

  // Invoices: only purge voided ones older than 30 days.
  try {
    const { data, error } = await admin
      .from('invoices')
      .delete()
      .eq('status', 'void')
      .lt('voided_at', cutoff)
      .select('id');
    if (error) errors.push(`invoices:${error.message}`);
    summary.invoices = data?.length ?? 0;
  } catch (e: any) {
    errors.push(`invoices:${e?.message ?? 'unknown'}`);
    summary.invoices = 0;
  }

  console.info('[cron/purge-deleted]', JSON.stringify({
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    purged: summary,
    errors: errors.length,
  }));

  return res.status(200).json({
    ok: true,
    started_at: startedAt,
    purged: summary,
    errors,
  });
}
