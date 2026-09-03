import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { validateTutorApplication, clientIp } from '../../../lib/agencyForms';
import { getAgencyOrganization } from '../../../lib/agencyOrg';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/email';
import { buildApplicationReceivedEmail, buildApplicationAlertEmail } from '../../../lib/emails/agency';
import { writeAudit } from '../../../lib/audit';
import { OWNER_EMAIL } from '../../../lib/owner';

// Public: a tutor application from /tutors/apply.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const ip = clientIp(req.headers, req.socket?.remoteAddress ?? 'unknown');
  const rl = checkRateLimit({ key: `tutor_application:${ip}`, limit: LIMITS.tutor_application.limit, windowMs: LIMITS.tutor_application.windowMs });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many applications from this connection. Email us instead.', retry_after_seconds: rl.retry_after_seconds });
  }

  const validated = validateTutorApplication(req.body);
  if (!validated.ok) {
    if (validated.errors.website) return res.status(200).json({ ok: true });
    return res.status(400).json({ error: 'Check the highlighted fields.', fields: validated.errors });
  }
  const v = validated.value;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const org = await getAgencyOrganization(admin);
  if (!org) {
    console.error('tutor-applications: agency organization not found');
    return res.status(500).json({ error: 'We could not save your application. Please email us.' });
  }

  // One open application per email: a second submission updates the first
  // instead of creating a duplicate the owner has to dedupe by hand.
  const { data: existing, error: existingErr } = await admin
    .from('tutor_applications')
    .select('id, status')
    .eq('organization_id', org.id)
    .eq('email', v.email)
    .in('status', ['new', 'screening', 'interview', 'test', 'offer'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const fields = {
    full_name: v.full_name,
    email: v.email,
    phone: v.phone,
    suburb: v.suburb,
    subjects: v.subjects,
    qualifications: v.qualifications,
    wwcc_status: v.wwcc_status,
    wwcc_number: v.wwcc_number,
    abn: v.abn,
    mode: v.mode,
    availability: v.availability,
    has_transport: v.has_transport,
    experience: v.experience,
    cv_url: v.cv_url,
    message: v.message,
    source: v.source,
    page_path: v.page_path,
    ip_hash: ipHash,
  };

  // Before the migration is applied the table does not exist (42P01): email only.
  const tableMissing = (existingErr as any)?.code === '42P01';
  let id: string = 'not-saved';
  if (tableMissing) {
    console.error('tutor-applications: table missing — emailed only. Apply supabase/migrations/20260903_agency_enquiries_applications.sql');
  } else if (existing?.id) {
    const { error } = await admin.from('tutor_applications').update(fields).eq('id', existing.id);
    if (error) {
      console.error('tutor-applications: update failed', error);
      return res.status(500).json({ error: 'We could not save your application. Please email us.' });
    }
    id = existing.id as string;
  } else {
    const { data: row, error } = await admin
      .from('tutor_applications')
      .insert({ organization_id: org.id, ...fields })
      .select('id')
      .single();
    if (error || !row) {
      console.error('tutor-applications: insert failed', error);
      return res.status(500).json({ error: 'We could not save your application. Please email us.' });
    }
    id = row.id as string;
  }

  const emailArgs = {
    fullName: v.full_name,
    email: v.email,
    phone: v.phone,
    suburb: v.suburb,
    subjects: v.subjects,
    qualifications: v.qualifications,
    wwccStatus: v.wwcc_status,
    mode: v.mode,
    availability: v.availability,
    experience: v.experience,
    cvUrl: v.cv_url,
    message: v.message,
    applicationId: id,
  };

  const alertEmail = buildApplicationAlertEmail(emailArgs);
  if (tableMissing) {
    alertEmail.subject = `[NOT SAVED — run the applications migration] ${alertEmail.subject}`;
    alertEmail.text = `The tutor_applications table does not exist yet, so this was emailed only.\n\n${alertEmail.text}`;
  }
  const [confirm, alert] = await Promise.all([
    sendEmail({ to: v.email, ...buildApplicationReceivedEmail(emailArgs) }),
    sendEmail({ to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL, replyTo: v.email, ...alertEmail }),
  ]);
  if (!confirm.success) console.error('tutor-applications: confirmation email failed', confirm.error);
  if (!alert.success) console.error('tutor-applications: owner alert failed', alert.error);

  if (!tableMissing) {
    await writeAudit(admin, {
      organizationId: org.id,
      actorUserId: null,
      actorRole: 'system',
      action: existing?.id ? 'tutor_application.updated' : 'tutor_application.created',
      entityType: 'tutor_application',
      entityId: id,
      payload: { entity_name: v.full_name, subjects: v.subjects, suburb: v.suburb, source: v.source },
    });
  }

  return res.status(200).json({ ok: true, id, stored: !tableMissing });
}
