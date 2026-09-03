import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { AGENCY } from '../../../lib/agency';

// Vercel Cron, daily. Emails the owner about tutors whose Working With
// Children Check expires within 60 days, or has expired, or is unverified.
// One email per run, only when there is something to say.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  if ((req.headers.authorization ?? '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const { data: tutors, error } = await admin
    .from('tutors')
    .select('id, name, email, organization_id, wwcc_number, wwcc_expiry, wwcc_verified_at, archived')
    .eq('archived', false);
  if (error) return res.status(500).json({ error: error.message });

  const today = new Date();
  const expired: string[] = [];
  const soon: string[] = [];
  const missing: string[] = [];
  for (const t of tutors ?? []) {
    if (!t.wwcc_number || !t.wwcc_verified_at) { missing.push(`${t.name}${t.email ? ` (${t.email})` : ''} — ${!t.wwcc_number ? 'no WWCC number' : 'not verified'}`); continue; }
    if (!t.wwcc_expiry) { missing.push(`${t.name} — no expiry date recorded`); continue; }
    const days = Math.ceil((new Date(t.wwcc_expiry).getTime() - today.getTime()) / 86_400_000);
    if (days < 0) expired.push(`${t.name} — expired ${t.wwcc_expiry} (${-days} days ago). Stand down until renewed.`);
    else if (days <= 60) soon.push(`${t.name} — expires ${t.wwcc_expiry} (${days} days). Ask them to renew now.`);
  }

  const total = expired.length + soon.length + missing.length;
  if (total === 0) return res.status(200).json({ ok: true, sent: false, tutors: (tutors ?? []).length });

  const lines = [
    expired.length ? `EXPIRED (${expired.length})\n` + expired.map((l) => `- ${l}`).join('\n') : null,
    soon.length ? `EXPIRING WITHIN 60 DAYS (${soon.length})\n` + soon.map((l) => `- ${l}`).join('\n') : null,
    missing.length ? `MISSING OR UNVERIFIED (${missing.length})\n` + missing.map((l) => `- ${l}`).join('\n') : null,
    `\nUpdate records: ${AGENCY.siteUrl}/app/tutors`,
  ].filter(Boolean).join('\n\n');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const result = await sendEmail({
    to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL,
    subject: `${expired.length ? 'ACTION: ' : ''}WWCC check — ${expired.length} expired, ${soon.length} expiring, ${missing.length} missing`,
    text: lines,
    html: `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(lines)}</pre>`,
  });
  console.info('[cron/wwcc-expiry]', JSON.stringify({ expired: expired.length, soon: soon.length, missing: missing.length, email_sent: result.success }));
  return res.status(200).json({ ok: true, sent: result.success, expired: expired.length, soon: soon.length, missing: missing.length });
}
