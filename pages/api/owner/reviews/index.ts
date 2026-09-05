import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { isMissingTableError } from '../../../../lib/dbErrors';
import { writeAudit } from '../../../../lib/audit';
import { sendEmail } from '../../../../lib/email';
import { AGENCY } from '../../../../lib/agency';
import { newReviewToken } from '../../../../lib/reviews';
import { buildReviewRequestEmail } from '../../../../lib/emails/softRun';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET  /api/owner/reviews?status=submitted|approved|hidden|requested|all
// POST /api/owner/reviews { household_id }  -> request a review by hand
//   (for the first families, or a family the cron has not reached yet).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  if (req.method === 'GET') {
    const status = typeof req.query.status === 'string' ? req.query.status : 'submitted';
    let query = ctx.admin
      .from('reviews')
      .select('id, created_at, updated_at, household_id, student_id, tutor_id, parent_email, token, language, source, requested_at, reminded_at, submitted_at, rating, body, reviewer_name, reviewer_suburb, consent_public, status, approved_at, household:households(display_name), student:students(name, year_level), tutor:tutors(name)')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (isMissingTableError(error)) return res.status(200).json({ reviews: [], setup_required: true });
    if (error) return res.status(500).json({ error: error.message });
    const rows = ((data ?? []) as any[]).map((r) => ({
      ...r,
      household_name: (Array.isArray(r.household) ? r.household[0]?.display_name : r.household?.display_name) ?? null,
      student_name: (Array.isArray(r.student) ? r.student[0]?.name : r.student?.name) ?? null,
      student_year_level: (Array.isArray(r.student) ? r.student[0]?.year_level : r.student?.year_level) ?? null,
      tutor_name: (Array.isArray(r.tutor) ? r.tutor[0]?.name : r.tutor?.name) ?? null,
      review_url: `${AGENCY.siteUrl}/review/${r.token}`,
      household: undefined, student: undefined, tutor: undefined,
    }));
    return res.status(200).json({ reviews: rows });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const householdId = typeof body.household_id === 'string' ? body.household_id : '';
  if (!UUID_RE.test(householdId)) return res.status(400).json({ error: 'Choose a household.' });

  const { data: hh } = await ctx.admin
    .from('households').select('id, display_name, preferred_language, billing_email').eq('id', householdId).eq('organization_id', org.id).maybeSingle();
  if (!hh) return res.status(404).json({ error: 'Household not found.' });

  const { data: open } = await ctx.admin.from('reviews').select('id').eq('household_id', householdId).in('status', ['requested', 'submitted']).limit(1);
  if (((open ?? []) as any[]).length > 0) return res.status(400).json({ error: 'This family already has a review request open.' });

  const { data: hp } = await ctx.admin
    .from('household_parents').select('is_primary, parent:parents(name, email)').eq('household_id', householdId).order('is_primary', { ascending: false }).limit(1);
  const row = ((hp ?? []) as any[])[0];
  const parent = row ? (Array.isArray(row.parent) ? row.parent[0] : row.parent) : null;
  const email = parent?.email ?? (hh as any).billing_email ?? null;
  if (!email) return res.status(400).json({ error: 'This household has no parent email.' });

  const { data: students } = await ctx.admin.from('students').select('id, name, primary_tutor_id').eq('household_id', householdId).eq('archived', false).order('name').limit(1);
  const student = ((students ?? []) as any[])[0] ?? null;
  let tutorFirst: string | null = null;
  if (student?.primary_tutor_id) {
    const { data: t } = await ctx.admin.from('tutors').select('name').eq('id', student.primary_tutor_id).maybeSingle();
    tutorFirst = ((t as any)?.name ?? '').split(' ')[0] || null;
  }
  const lang: 'en' | 'es' = (hh as any).preferred_language === 'es' ? 'es' : 'en';
  const token = newReviewToken();
  const { data: created, error } = await ctx.admin
    .from('reviews')
    .insert({
      organization_id: org.id,
      household_id: householdId,
      student_id: student?.id ?? null,
      tutor_id: student?.primary_tutor_id ?? null,
      parent_email: email,
      token,
      language: lang,
      source: 'manual',
      requested_at: new Date().toISOString(),
      status: 'requested',
    })
    .select('id')
    .single();
  if (error || !created) {
    if (isMissingTableError(error)) return res.status(400).json({ error: 'The reviews table does not exist yet. Run the chunk 5 migration.' });
    return res.status(500).json({ error: error?.message ?? 'Could not create the request.' });
  }

  const mail = buildReviewRequestEmail({
    parentName: parent?.name ?? null,
    studentFirstName: student?.name ? String(student.name).split(' ')[0] : null,
    tutorFirstName: tutorFirst,
    reviewUrl: `${AGENCY.siteUrl}/review/${token}`,
    lang,
  });
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent.success) {
    await ctx.admin.from('reviews').delete().eq('id', created.id);
    return res.status(502).json({ error: `The email could not be sent (${sent.error ?? 'unknown'}). Nothing was saved.` });
  }
  await writeAudit(ctx.admin, { organizationId: org.id, actorUserId: ctx.userId, actorRole: 'owner', action: 'review.requested', entityType: 'review', entityId: created.id, payload: { entity_name: (hh as any).display_name, household_id: householdId } });
  return res.status(200).json({ ok: true, id: created.id, review_url: `${AGENCY.siteUrl}/review/${token}` });
}
