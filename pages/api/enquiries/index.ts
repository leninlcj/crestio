import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { validateEnquiry, clientIp } from '../../../lib/agencyForms';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { checkRateLimitShared, LIMITS } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/email';
import { buildEnquiryReceivedEmail, buildEnquiryAlertEmail } from '../../../lib/emails/agency';
import { writeAudit } from '../../../lib/audit';
import { OWNER_EMAIL } from '../../../lib/owner';
import { isMissingTableError } from '../../../lib/dbErrors';
import { pushOwner } from '../../../lib/notify';
import { classByKey } from '../../../lib/classes';
import { AGENCY } from '../../../lib/agency';

// Public: a family enquiry from /enquire, or a call request from
// /request-a-call (preferred_contact = 'call'). Writes via the service role
// (the table has no INSERT policy), emails the family a confirmation when
// they gave an email, and alerts the owner by email and phone push. Never
// leaks whether an email exists.

const CHUNK6_MIGRATION = 'supabase/migrations/20260906_agency_chunk6.sql';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column|schema cache/i.test(err.message ?? '');
}

function isNotNullViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '23502' || /null value in column/i.test(err.message ?? ''));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const ip = clientIp(req.headers, req.socket?.remoteAddress ?? 'unknown');
  const rl = await checkRateLimitShared(admin, { key: `enquiry:${ip}`, limit: LIMITS.enquiry.limit, windowMs: LIMITS.enquiry.windowMs });
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

  // Never lose an enquiry. If the agency organisation cannot be resolved or
  // the table does not exist yet, fall back to email-only and flag it.
  const org = await getAgencyOrganization(admin);
  if (!org) console.error('enquiries: agency organization not found; emailing only');

  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const isCall = v.preferred_contact === 'call';
  const groupClass = classByKey(v.class_key);
  // A class registration is an ordinary enquiry with the class named in the
  // message and the source, so the owner sees it without a new screen.
  const message = groupClass
    ? [`[Class: ${groupClass.title}, ${groupClass.term}]`, v.message].filter(Boolean).join('\n\n')
    : v.message;
  const source = groupClass && !v.source?.startsWith('class:') ? `class:${groupClass.key}${v.source ? ` ${v.source}` : ''}`.slice(0, 120) : v.source;

  const baseRow = {
    organization_id: org?.id,
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
    message,
    source,
    page_path: v.page_path,
    ip_hash: ipHash,
  };
  const chunk6Row = { preferred_contact: v.preferred_contact, best_time: v.best_time, class_key: v.class_key };

  let row: { id: string } | null = null;
  let insertErr: { code?: string; message?: string } | null = null;
  let migrationPending = false;
  if (org) {
    const first = await admin.from('enquiries').insert({ ...baseRow, ...chunk6Row }).select('id').single();
    row = first.data as { id: string } | null;
    insertErr = first.error;
    if (insertErr && isMissingColumnError(insertErr)) {
      // Chunk 6 migration not applied yet: store what the old table accepts.
      migrationPending = true;
      const retry = await admin.from('enquiries').insert(baseRow).select('id').single();
      row = retry.data as { id: string } | null;
      insertErr = retry.error;
    }
  }
  // Before the migration, email is NOT NULL: a phone-only call request cannot
  // be stored. Email it to the owner rather than lose it.
  const unsaveable = !!insertErr && isNotNullViolation(insertErr) && v.email == null;
  const tableMissing = !org || isMissingTableError(insertErr) || unsaveable;
  if ((insertErr || !row) && !tableMissing) {
    console.error('enquiries: insert failed', insertErr);
    return res.status(500).json({ error: 'We could not save your enquiry. Please email us.' });
  }
  const enquiryId = (row?.id as string | undefined) ?? 'not-saved';
  if (migrationPending) console.error(`enquiries: stored without call-request columns. Apply ${CHUNK6_MIGRATION}`);

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
    preferredContact: v.preferred_contact,
    bestTime: v.best_time,
    className: groupClass?.title ?? null,
  };

  const leadUrl = `${AGENCY.siteUrl}/app/leads?enquiry=${enquiryId}`;
  const [confirm, alert, push] = await Promise.all([
    (async () => {
      if (!v.email) return { success: true as const, skipped: true };
      const b = buildEnquiryReceivedEmail(emailArgs);
      return sendEmail({ to: v.email, ...b });
    })(),
    (async () => {
      const b = buildEnquiryAlertEmail(emailArgs);
      if (tableMissing) {
        const why = !org ? 'agency organisation not found' : unsaveable ? `run ${CHUNK6_MIGRATION}` : 'run the enquiries migration';
        b.subject = `[NOT SAVED: ${why}] ${b.subject}`;
        b.text = `${!org ? 'The agency organisation could not be resolved' : unsaveable ? 'A phone-only call request cannot be stored until the chunk 6 migration runs' : 'The enquiries table does not exist yet'}, so this was emailed only.\n\n${b.text}`;
      }
      return sendEmail({ to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL, ...(v.email ? { replyTo: v.email } : {}), ...b });
    })(),
    pushOwner({
      title: isCall ? `Call ${v.parent_name}${v.phone ? ` ${v.phone}` : ''}` : `New enquiry: ${v.parent_name}`,
      message: [
        `${v.year_level}${v.subjects.length > 0 ? ` · ${v.subjects.join(', ')}` : ''}`,
        groupClass ? `Class: ${groupClass.title}` : null,
        isCall ? `Best time: ${v.best_time ?? 'any'}` : `Email: ${v.email}`,
        v.suburb ? `Suburb: ${v.suburb}` : null,
      ].filter(Boolean).join('\n'),
      click: leadUrl,
      priority: isCall ? 4 : 3,
      tags: [isCall ? 'telephone_receiver' : 'envelope'],
    }),
  ]);
  if (!confirm.success) console.error('enquiries: confirmation email failed', 'error' in confirm ? confirm.error : undefined);
  if (!alert.success) console.error('enquiries: owner alert failed', alert.error);
  if (!push.sent && push.reason !== 'not_configured') console.error('enquiries: owner push failed', push.reason);

  if (!tableMissing && org) {
    await writeAudit(admin, {
      organizationId: org.id,
      actorUserId: null,
      actorRole: 'system',
      action: isCall ? 'enquiry.call_requested' : 'enquiry.created',
      entityType: 'enquiry',
      entityId: enquiryId,
      payload: { entity_name: v.parent_name, year_level: v.year_level, subjects: v.subjects, source, class_key: v.class_key },
    });
  } else {
    console.error(`enquiries: not stored; emailed only. Apply supabase/migrations/20260903_agency_enquiries_applications.sql and ${CHUNK6_MIGRATION}`);
  }

  return res.status(200).json({ ok: true, id: enquiryId, stored: !tableMissing });
}
