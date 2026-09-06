import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { AGENCY } from '../../../lib/agency';
import { buildEnquiryFollowupEmail } from '../../../lib/emails/agency';
import { isMissingTableError } from '../../../lib/dbErrors';

// Vercel Cron, daily. Three jobs, all idempotent through the columns added
// in supabase/migrations/20260905_agency_chunk3.sql:
//
// 1. Owner nudge: a 'new' enquiry older than 24 hours breaks the reply
//    promise on the site. One email listing them, then owner_nudged_at is set.
// 2. Family follow-up 1 on day 3: enquiry still 'new' or 'contacted', no
//    household created, nothing sent yet.
// 3. Family follow-up 2 on day 10: the last message. After this the family
//    never hears from the cron again.
//
// Nothing older than 14 days is touched, so deploying this later never
// sends a stale flurry.

type Row = {
  id: string;
  created_at: string;
  status: string;
  parent_name: string;
  email: string | null;
  student_first_name: string | null;
  year_level: string;
  subjects: string[];
  source: string | null;
  household_id: string | null;
  followup_1_sent_at: string | null;
  followup_2_sent_at: string | null;
  owner_nudged_at: string | null;
};

const DAY = 86_400_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  if ((req.headers.authorization ?? '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const now = Date.now();
  const since = new Date(now - 14 * DAY).toISOString();
  const { data, error } = await admin
    .from('enquiries')
    .select('id, created_at, status, parent_name, email, student_first_name, year_level, subjects, source, household_id, followup_1_sent_at, followup_2_sent_at, owner_nudged_at')
    .in('status', ['new', 'contacted'])
    .is('household_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    // Table or columns not there yet: say so, do not fail the cron.
    if (isMissingTableError(error) || /column|schema cache/i.test(error.message)) {
      console.warn('[cron/enquiry-followups] enquiries table or follow-up columns missing; run the pending migrations', error.message);
      return res.status(200).json({ ok: true, skipped: 'setup_required' });
    }
    return res.status(500).json({ error: error.message });
  }

  const rows = (data ?? []) as Row[];
  const ageDays = (r: Row) => (now - new Date(r.created_at).getTime()) / DAY;

  // 1) Owner nudge for unanswered enquiries.
  const overdue = rows.filter((r) => r.status === 'new' && ageDays(r) >= 1 && !r.owner_nudged_at);
  let nudged = 0;
  if (overdue.length > 0) {
    const lines = overdue.map((r) => `- ${r.parent_name} (${r.email ?? 'phone only: call them'}), ${r.year_level}, ${Math.floor(ageDays(r))} day(s) waiting: ${AGENCY.siteUrl}/app/leads?enquiry=${r.id}`);
    const text = `These enquiries have had no reply for more than 24 hours. The site promises a reply within ${AGENCY.policies.replyWithinHours} hours.\n\n${lines.join('\n')}\n\nOpen leads: ${AGENCY.siteUrl}/app/leads`;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const result = await sendEmail({
      to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL,
      subject: `ACTION: ${overdue.length} ${overdue.length === 1 ? 'enquiry' : 'enquiries'} waiting more than 24 hours`,
      text,
      html: `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(text)}</pre>`,
    });
    if (result.success) {
      const stamp = new Date().toISOString();
      await admin.from('enquiries').update({ owner_nudged_at: stamp }).in('id', overdue.map((r) => r.id));
      nudged = overdue.length;
    }
  }

  // 2) and 3) Family follow-ups.
  let sent1 = 0;
  let sent2 = 0;
  for (const r of rows) {
    // Phone-only call requests are chased by phone, never by an email they did not give.
    if (!r.email) continue;
    const age = ageDays(r);
    const lang: 'en' | 'es' = (r.source ?? '').startsWith('es:') ? 'es' : 'en';
    const common = { parentName: r.parent_name, studentFirstName: r.student_first_name, subjects: r.subjects ?? [], createdAt: r.created_at, lang };
    if (!r.followup_1_sent_at && age >= 3 && age < 7) {
      const email = buildEnquiryFollowupEmail({ ...common, step: 1 });
      const result = await sendEmail({ to: r.email, subject: email.subject, html: email.html, text: email.text });
      if (result.success) {
        await admin.from('enquiries').update({ followup_1_sent_at: new Date().toISOString() }).eq('id', r.id);
        sent1 += 1;
      }
    } else if (r.followup_1_sent_at && !r.followup_2_sent_at && age >= 10) {
      const email = buildEnquiryFollowupEmail({ ...common, step: 2 });
      const result = await sendEmail({ to: r.email, subject: email.subject, html: email.html, text: email.text });
      if (result.success) {
        await admin.from('enquiries').update({ followup_2_sent_at: new Date().toISOString() }).eq('id', r.id);
        sent2 += 1;
      }
    }
  }

  console.info('[cron/enquiry-followups]', JSON.stringify({ open: rows.length, nudged, sent1, sent2 }));
  return res.status(200).json({ ok: true, open: rows.length, nudged, sent1, sent2 });
}
