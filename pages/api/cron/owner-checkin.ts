import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { assembleOwnerCheckin } from '../../../lib/ownerCheckin';
import { buildOwnerCheckinEmail } from '../../../lib/emails/softRun';

// Vercel Cron, Sunday 20:00 UTC, which is Monday 06:00 AEST or 07:00 AEDT.
// One email to the owner: what is waiting on him this week, with numbers,
// names and links, or "quiet week". Assembled in lib/ownerCheckin.ts.
// GET ?dry=1 with the cron secret returns the data without sending.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  if ((req.headers.authorization ?? '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const org = await getAgencyOrganization(admin);
  if (!org) return res.status(200).json({ ok: true, skipped: 'agency_org_missing' });

  const data = await assembleOwnerCheckin(admin, org.id, new Date());
  if (req.query.dry === '1') return res.status(200).json({ ok: true, dry: true, data });

  const email = buildOwnerCheckinEmail(data);
  const result = await sendEmail({
    to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  console.info('[cron/owner-checkin]', JSON.stringify({ sections: data.sections.map((s) => s.title), quiet: data.quiet, email_sent: result.success }));
  return res.status(200).json({ ok: true, sent: result.success, quiet: data.quiet, sections: data.sections.length });
}
