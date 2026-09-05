import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateIncident, INCIDENT_CATEGORIES } from '../../../lib/incidentForms';
import { clientIp } from '../../../lib/agencyForms';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { checkRateLimitShared } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/email';
import { isMissingTableError } from '../../../lib/dbErrors';
import { writeAudit } from '../../../lib/audit';
import { OWNER_EMAIL } from '../../../lib/owner';
import { AGENCY } from '../../../lib/agency';

// Public: a concern or complaint from /report. Always reaches the owner by
// email; stored in `incidents` when the table exists.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const ip = clientIp(req.headers, req.socket?.remoteAddress ?? 'unknown');
  const rl = await checkRateLimitShared(admin, { key: `incident:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return res.status(429).json({ error: 'Too many reports from this connection. Email us instead.', retry_after_seconds: rl.retry_after_seconds });

  const validated = validateIncident(req.body);
  if (!validated.ok) {
    if (validated.errors.website) return res.status(200).json({ ok: true });
    return res.status(400).json({ error: 'Check the highlighted fields.', fields: validated.errors });
  }
  const v = validated.value;

  const org = await getAgencyOrganization(admin);

  let id = 'not-saved';
  let stored = false;
  if (org) {
    const { data, error } = await admin
      .from('incidents')
      .insert({
        organization_id: org.id,
        reported_by_user_id: null,
        reported_by_role: v.reporter_role,
        reporter_name: v.reporter_name,
        reporter_email: v.reporter_email,
        occurred_at: v.occurred_at,
        category: v.category,
        description: [v.who ? `About: ${v.who}` : null, v.reporter_phone ? `Phone: ${v.reporter_phone}` : null, v.description].filter(Boolean).join('\n\n'),
      })
      .select('id')
      .single();
    if (error && !isMissingTableError(error)) {
      console.error('incidents: insert failed', error);
    } else if (data) {
      id = data.id as string;
      stored = true;
    }
  }

  const catLabel = INCIDENT_CATEGORIES.find((c) => c.key === v.category)?.label ?? v.category;
  const lines = [
    `Category: ${catLabel}`,
    `From: ${v.reporter_name} (${v.reporter_role}), ${v.reporter_email}${v.reporter_phone ? `, ${v.reporter_phone}` : ''}`,
    v.occurred_at ? `When: ${new Date(v.occurred_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}` : null,
    v.who ? `About: ${v.who}` : null,
    '',
    v.description,
    '',
    stored ? `Open: ${AGENCY.siteUrl}/app/leads/incidents?incident=${id}` : 'NOT SAVED: the incidents table does not exist yet; run the chunk 2 migration.',
  ].filter((l) => l !== null).join('\n');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const alert = await sendEmail({
    to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL,
    replyTo: v.reporter_email,
    subject: `[${v.category === 'safety' ? 'SAFETY ' : ''}Report] ${catLabel}, from ${v.reporter_name}`,
    text: lines,
    html: `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(lines)}</pre>`,
  });
  if (!alert.success) console.error('incidents: owner alert failed', alert.error);

  await sendEmail({
    to: v.reporter_email,
    subject: 'We received your report',
    text: `Hi ${v.reporter_name.split(' ')[0]},\n\nThank you for telling us. Your report has gone directly to ${AGENCY.founder.name}, who will reply within one business day. If a child is in immediate danger, call 000. The NSW Child Protection Helpline is 132 111.\n\n--\n${AGENCY.name} | ${AGENCY.siteUrl}\n`,
    html: `<p>Hi ${esc(v.reporter_name.split(' ')[0])},</p><p>Thank you for telling us. Your report has gone directly to ${esc(AGENCY.founder.name)}, who will reply within one business day.</p><p>If a child is in immediate danger, call 000. The NSW Child Protection Helpline is 132 111.</p><p style="color:#666;font-size:12px">${esc(AGENCY.name)} · <a href="${AGENCY.siteUrl}">crestio.ai</a></p>`,
  });

  if (stored && org) {
    await writeAudit(admin, { organizationId: org.id, actorUserId: null, actorRole: 'system', action: 'incident.created', entityType: 'incident', entityId: id, payload: { category: v.category, entity_name: v.reporter_name } });
  }
  return res.status(200).json({ ok: true, id, stored });
}
