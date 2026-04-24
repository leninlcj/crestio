import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '../../../lib/notifications';
import { getBaseUrl } from '../../../lib/stripe';

// Vercel Cron → daily at 09:00 UTC (~7pm Sydney end-of-day).
// One-time nag per invoice for invoices 14–60 days past due.
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
  const baseUrl = getBaseUrl(req);
  let created = 0;
  let dupes = 0;
  const errors: string[] = [];

  try {
    const nowMs = Date.now();
    const cutoffNew = new Date(nowMs - 14 * 86_400_000).toISOString().slice(0, 10);
    const cutoffOld = new Date(nowMs - 60 * 86_400_000).toISOString().slice(0, 10);

    const { data: invoices } = await admin
      .from('invoices')
      .select('id, number, status, total_cents, due_on, owner_id, student:students!inner(id, name)')
      .in('status', ['sent', 'unpaid', 'overdue'])
      .lt('due_on', cutoffNew)
      .gt('due_on', cutoffOld);

    for (const inv of (invoices ?? []) as any[]) {
      if (!inv.owner_id) continue;
      const amount = formatCents(inv.total_cents ?? 0);
      const result = await createNotification(admin, {
        userId: inv.owner_id,
        type: 'invoice_overdue',
        titleKey: 'invoice_overdue.title',
        bodyKey: 'invoice_overdue.body',
        templateVars: {
          number: inv.number,
          student: inv.student?.name ?? 'A student',
          amount,
          due_date: inv.due_on,
        },
        linkUrl: `/app/invoices/${inv.id}`,
        context: { invoice_id: inv.id, student_id: inv.student?.id },
        dedupeKey: `invoice_overdue_14d:${inv.id}`,
        baseUrl,
      });
      if (result.ok) created++;
      else if (result.reason === 'dedupe') dupes++;
      else errors.push(`${inv.id}:${result.error ?? 'unknown'}`);
    }
  } catch (e: any) {
    errors.push(`scan:${e?.message ?? 'unknown'}`);
  }

  const completedAt = new Date().toISOString();
  console.info('[cron/overdue-invoices]', JSON.stringify({
    started_at: startedAt, completed_at: completedAt,
    notifications_created: created, skipped_dupes: dupes, errors: errors.length,
  }));
  return res.status(200).json({
    ok: true, started_at: startedAt, completed_at: completedAt,
    notifications_created: created, skipped_dupes: dupes, errors,
  });
}

function formatCents(c: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2,
  }).format(c / 100);
}
