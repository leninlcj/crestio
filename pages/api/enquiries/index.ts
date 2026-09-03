import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { validateEnquiry, clientIp } from '../../../lib/agencyForms';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/email';
import { buildEnquiryReceivedEmail, buildEnquiryAlertEmail } from '../../../lib/emails/agency';
import { writeAudit } from '../../../lib/audit';
import { OWNER_EMAIL } from '../../../lib/owner';

// Public: a family enquiry from /enquire. Writes via the service role (the
// table has no INSERT policy), emails the family a confirmation and the
// owner an alert. Never leaks whether an email exists.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const ip = clientIp(req.headers, req.socket?.remoteAddress ?? 'unknown');
  const rl = checkRateLimit({ key: `enquiry:${ip}`, limit: LIMITS.enquiry.limit, windowMs: LIMITS.enquiry.windowMs });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many enquiries from this connection. Email us instead.', retry_after_seconds: rl.retry_after_seconds });
  }

  const validated = validateEnquiry(req.body);
  if (!validated.ok) {
    // Honeypot hits get a quiet 200 so bots learn nothing.
    if (validated.errors.website) return res.status(200).json({ ok: true });
    return res.status(400).json({ error: 'Check the highlighted fields.', fields: validated.errors });
  }
  const v = validated.value;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const org = await getAgencyOrganization(admin);
  if (!org) {
    console.error('enquiries: agency organization not found');
    return res.status(500).json({ error: 'We could not save your enquiry. Please email us.' });
  }

  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const { data: row, error: insertErr } = await admin
    .from('enquiries')
    .insert({
      organization_id: org.id,
      who: v.who,
      parent_name: v.parent_name,
      email: v.email,
      phone: v.phone,
      student_first_name: v.student_first_name,
      year_level: v.year_level,
      subjects: v.subjects,
      mode: v.mode,
      suburb: v.suburb,
      need: v.need,
      message: v.message,
      source: v.source,
      page_path: v.page_path,
      ip_hash: ipHash,
    })
    .select('id')
    .single();
  // Before the migration is applied the table does not exist (42P01). Never
  // lose an enquiry: fall back to email-only and tell the owner.
  const tableMissing = (insertErr as any)?.code === '42P01';
  if ((insertErr || !row) && !tableMissing) {
    console.error('enquiries: insert failed', insertErr);
    return res.status(500).json({ error: 'We could not save your enquiry. Please email us.' });
  }
  const enquiryId = (row?.id as string | undefined) ?? 'not-saved';

  const emailArgs = {
    parentName: v.parent_name,
    email: v.email,
    phone: v.phone,
    studentFirstName: v.student_first_name,
    yearLevel: v.year_level,
    subjects: v.subjects,
    mode: v.mode,
    suburb: v.suburb,
    need: v.need,
    message: v.message,
    enquiryId,
  };

  const [confirm, alert] = await Promise.all([
    (async () => {
      const b = buildEnquiryReceivedEmail(emailArgs);
      return sendEmail({ to: v.email, ...b });
    })(),
    (async () => {
      const b = buildEnquiryAlertEmail(emailArgs);
      if (tableMissing) {
        b.subject = `[NOT SAVED — run the enquiries migration] ${b.subject}`;
        b.text = `The enquiries table does not exist yet, so this was emailed only.\n\n${b.text}`;
      }
      return sendEmail({ to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL, replyTo: v.email, ...b });
    })(),
  ]);
  if (!confirm.success) console.error('enquiries: confirmation email failed', confirm.error);
  if (!alert.success) console.error('enquiries: owner alert failed', alert.error);

  if (!tableMissing) {
    await writeAudit(admin, {
      organizationId: org.id,
      actorUserId: null,
      actorRole: 'system',
      action: 'enquiry.created',
      entityType: 'enquiry',
      entityId: enquiryId,
      payload: { entity_name: v.parent_name, year_level: v.year_level, subjects: v.subjects, source: v.source },
    });
  } else {
    console.error('enquiries: table missing — emailed only. Apply supabase/migrations/20260903_agency_enquiries_applications.sql');
  }

  return res.status(200).json({ ok: true, id: enquiryId, stored: !tableMissing });
}
