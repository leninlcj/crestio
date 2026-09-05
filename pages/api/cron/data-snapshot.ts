import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { AGENCY } from '../../../lib/agency';
import { takeSnapshot, SNAPSHOT_KEEP } from '../../../lib/snapshot';

// Vercel Cron, weekly. Copies every table into a private Storage bucket and
// tells the owner it happened (counts only, never the data). See lib/snapshot.ts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  if ((req.headers.authorization ?? '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const to = process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL;
  try {
    const r = await takeSnapshot(admin);
    const countLines = Object.entries(r.counts).map(([t, n]) => `- ${t}: ${n}`).join('\n');
    const text = `Weekly snapshot saved: ${r.path} (${Math.round(r.bytes / 1024)} KB). The newest ${SNAPSHOT_KEEP} are kept.\n\nRows:\n${countLines}` +
      (r.skipped.length ? `\n\nTables not present yet (run the pending migrations): ${r.skipped.join(', ')}` : '') +
      `\n\nDownload from the app: ${AGENCY.siteUrl}/app/settings/data`;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendEmail({ to, subject: `Crestio weekly snapshot saved (${Object.values(r.counts).reduce((a, b) => a + b, 0)} rows)`, text, html: `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(text)}</pre>` });
    console.info('[cron/data-snapshot]', JSON.stringify({ path: r.path, bytes: r.bytes, skipped: r.skipped.length }));
    return res.status(200).json({ ok: true, ...r });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error('[cron/data-snapshot] failed', message);
    await sendEmail({ to, subject: 'ACTION: Crestio weekly snapshot failed', text: `The weekly data snapshot did not run: ${message}`, html: `<p>The weekly data snapshot did not run: ${message.replace(/</g, '&lt;')}</p>` });
    return res.status(500).json({ ok: false, error: message });
  }
}
