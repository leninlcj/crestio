import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../../lib/agencyOrg';
import { writeAudit } from '../../../../../lib/audit';
import { hourlyRateCents, rateBandForYearLevel, rateBand, subjectLabels, type SubjectKey } from '../../../../../lib/agency';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/owner/enquiries/[id]/convert
// Body: { student_name?: string, mode?: 'online'|'in_home', hourly_rate_cents?: number, tutor_id?: string|null }
// Creates (or reuses by email) the parent, creates a household and a student,
// links them all to the enquiry and marks it converted. Nothing is emailed:
// the parent invitation is sent from People → Parents when the owner is ready.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });

  const org = await getAgencyOrganization(admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const { data: enq, error: enqErr } = await admin
    .from('enquiries')
    .select('*')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle();
  if (enqErr) return res.status(500).json({ error: enqErr.message });
  if (!enq) return res.status(404).json({ error: 'not_found' });
  if (enq.converted_at) return res.status(400).json({ error: 'Already converted.', household_id: enq.household_id, student_id: enq.student_id });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode: 'online' | 'in_home' = body.mode === 'in_home' ? 'in_home' : body.mode === 'online' ? 'online' : (enq.mode === 'in_home' ? 'in_home' : 'online');

  const subjects = (enq.subjects ?? []) as SubjectKey[];
  let rateCents: number | null = null;
  if (typeof body.hourly_rate_cents === 'number' && Number.isFinite(body.hourly_rate_cents) && body.hourly_rate_cents >= 0) {
    rateCents = Math.round(body.hourly_rate_cents);
  } else {
    // Highest applicable rate among the chosen subjects, else the year-level band.
    for (const s of subjects) {
      const r = hourlyRateCents(s, mode);
      if (r != null && (rateCents == null || r > rateCents)) rateCents = r;
    }
    if (rateCents == null) {
      const band = rateBandForYearLevel(enq.year_level);
      if (band) {
        const b = rateBand(band);
        const d = mode === 'online' ? b.online : b.inHome;
        rateCents = d == null ? null : d * 100;
      }
    }
  }

  let tutorId: string | null = enq.assigned_tutor_id ?? null;
  if (body.tutor_id === null) tutorId = null;
  else if (typeof body.tutor_id === 'string') {
    if (!UUID_RE.test(body.tutor_id)) return res.status(400).json({ error: 'invalid_tutor' });
    tutorId = body.tutor_id;
  }
  if (tutorId) {
    const { data: t } = await admin.from('tutors').select('id').eq('id', tutorId).eq('organization_id', org.id).maybeSingle();
    if (!t) return res.status(400).json({ error: 'invalid_tutor' });
  }

  const parentName: string = enq.parent_name;
  // A call request may have no email. The parent record needs one for the
  // portal invitation, so the owner supplies it (asked for on the call).
  const bodyEmail = typeof body.parent_email === 'string' ? body.parent_email.trim().toLowerCase() : '';
  const parentEmail: string = (enq.email ? String(enq.email).toLowerCase() : bodyEmail);
  if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return res.status(400).json({ error: 'This family gave a phone number only. Enter the parent email (from the call) to create the household.' });
  }
  const lastName = parentName.trim().split(/\s+/).slice(-1)[0] ?? '';
  const studentName = typeof body.student_name === 'string' && body.student_name.trim()
    ? body.student_name.trim().slice(0, 120)
    : enq.who === 'me'
      ? parentName
      : [enq.student_first_name, lastName].filter(Boolean).join(' ') || `${lastName || parentName} student`;

  // 1) Parent (reuse by email within the org).
  const { data: existingParent } = await admin
    .from('parents').select('id').eq('organization_id', org.id).eq('email', parentEmail).maybeSingle();
  let parentId = existingParent?.id as string | undefined;
  if (!parentId) {
    const { data: created, error } = await admin
      .from('parents')
      .insert({ organization_id: org.id, auth_user_id: null, email: parentEmail, name: parentName, phone: enq.phone ?? null })
      .select('id')
      .single();
    if (error || !created) return res.status(500).json({ error: error?.message ?? 'Could not create parent.' });
    parentId = created.id as string;
  }

  // 2) Household.
  const householdName = enq.who === 'me' ? parentName : (lastName ? `${lastName} family` : `${parentName} family`);
  const householdRow: Record<string, unknown> = {
    organization_id: org.id,
    display_name: householdName,
    billing_email: parentEmail,
    notes: enq.message ? `From enquiry: ${enq.message}` : null,
    // Spanish enquiries (from /es) keep their language for later emails such as review requests.
    preferred_language: String(enq.source ?? '').startsWith('es:') ? 'es' : 'en',
  };
  let { data: household, error: hErr } = await admin.from('households').insert(householdRow).select('id').single();
  if (hErr && /preferred_language|column|schema cache/i.test(hErr.message)) {
    // Chunk 5 migration not run yet: create the household without the language.
    delete householdRow.preferred_language;
    ({ data: household, error: hErr } = await admin.from('households').insert(householdRow).select('id').single());
  }
  if (hErr || !household) return res.status(500).json({ error: hErr?.message ?? 'Could not create household.' });

  const { error: linkErr } = await admin
    .from('household_parents')
    .upsert({ household_id: household.id, parent_id: parentId, is_primary: true }, { onConflict: 'household_id,parent_id', ignoreDuplicates: true });
  if (linkErr) return res.status(500).json({ error: `Household created but parent link failed: ${linkErr.message}` });

  // 3) Student.
  const notesParts = [
    `Enquiry ${new Date(enq.created_at).toLocaleDateString('en-AU')}: ${enq.mode === 'either' ? 'online or in-home' : enq.mode === 'in_home' ? 'in-home' : 'online'}${enq.suburb ? ` · ${enq.suburb}` : ''}.`,
    enq.need ? `Focus: ${enq.need}.` : null,
    enq.message ? `Parent wrote: ${enq.message}` : null,
  ].filter(Boolean);
  const { data: student, error: sErr } = await admin
    .from('students')
    .insert({
      owner_id: userId,
      organization_id: org.id,
      name: studentName,
      year_level: enq.year_level,
      subjects: subjectLabels(subjects),
      hourly_rate_cents: rateCents,
      notes: notesParts.join(' '),
      household_id: household.id,
      primary_tutor_id: tutorId,
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: enq.phone ?? null,
    })
    .select('id')
    .single();
  if (sErr || !student) return res.status(500).json({ error: sErr?.message ?? 'Could not create student.' });

  // 4) Link back.
  const { error: uErr } = await admin
    .from('enquiries')
    .update({
      household_id: household.id,
      student_id: student.id,
      assigned_tutor_id: tutorId,
      converted_at: new Date().toISOString(),
      status: enq.status === 'new' || enq.status === 'contacted' ? 'trial_booked' : enq.status,
      // A phone-only call request gets the email the owner collected on the call.
      ...(enq.email ? {} : { email: parentEmail }),
    })
    .eq('id', id);
  if (uErr) console.error('convert: enquiry link update failed', uErr);

  await writeAudit(admin, {
    organizationId: org.id,
    actorUserId: userId,
    actorRole: 'owner',
    action: 'enquiry.converted',
    entityType: 'enquiry',
    entityId: id,
    payload: { entity_name: parentName, household_id: household.id, student_id: student.id, tutor_id: tutorId },
  });

  return res.status(200).json({
    ok: true,
    household_id: household.id,
    student_id: student.id,
    parent_id: parentId,
    hourly_rate_cents: rateCents,
  });
}
