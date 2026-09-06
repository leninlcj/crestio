import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { getAgencyOrganization } from '../../../../lib/agencyOrg';
import { writeAudit } from '../../../../lib/audit';
import { sendEmail } from '../../../../lib/email';
import { buildCallbackMissedEmail } from '../../../../lib/emails/agency';

const STATUSES = ['new', 'contacted', 'trial_booked', 'matched', 'lost', 'spam'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT = 'id, status, owner_notes, assigned_tutor_id, contacted_at, converted_at, updated_at, call_attempts, last_call_attempt_at, unreachable_notice_sent_at';

// PATCH /api/owner/enquiries/[id]  { status?, owner_notes?, assigned_tutor_id? }
//                                 | { action: 'no_answer' }
//
// 'no_answer' records a call attempt and, when the family gave an email,
// sends the "we tried to call you" note (at most once every 20 hours) that
// restates the one-business-day promise and asks for a better time.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });

  const org = await getAgencyOrganization(ctx.admin);
  if (!org) return res.status(500).json({ error: 'agency_org_missing' });

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.action === 'no_answer') return noAnswer(ctx, org.id, id, res);

  const patch: Record<string, unknown> = {};

  if (typeof body.status === 'string') {
    if (!(STATUSES as readonly string[]).includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
    patch.status = body.status;
    if (body.status === 'contacted') patch.contacted_at = new Date().toISOString();
  }
  if (typeof body.owner_notes === 'string') patch.owner_notes = body.owner_notes.slice(0, 4000);
  if (body.assigned_tutor_id === null) patch.assigned_tutor_id = null;
  else if (typeof body.assigned_tutor_id === 'string') {
    if (!UUID_RE.test(body.assigned_tutor_id)) return res.status(400).json({ error: 'invalid_tutor' });
    const { data: tutor } = await ctx.admin
      .from('tutors').select('id').eq('id', body.assigned_tutor_id).eq('organization_id', org.id).maybeSingle();
    if (!tutor) return res.status(400).json({ error: 'invalid_tutor' });
    patch.assigned_tutor_id = body.assigned_tutor_id;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await ctx.admin
    .from('enquiries')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', org.id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });

  await writeAudit(ctx.admin, {
    organizationId: org.id,
    actorUserId: ctx.userId,
    actorRole: 'owner',
    action: 'enquiry.updated',
    entityType: 'enquiry',
    entityId: id,
    payload: { fields: Object.keys(patch), status: patch.status ?? null },
  });

  return res.status(200).json({ enquiry: pick(data) });
}

type Ctx = NonNullable<Awaited<ReturnType<typeof resolveOwnerRequest>>>;

function pick(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of SELECT.split(',').map((s) => s.trim())) if (k in row) out[k] = row[k];
  return out;
}

async function noAnswer(ctx: Ctx, orgId: string, id: string, res: NextApiResponse) {
  const { data: row, error } = await ctx.admin
    .from('enquiries')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (!('call_attempts' in row)) {
    return res.status(409).json({ error: 'Run supabase/migrations/20260906_agency_chunk6.sql first: the call-attempt columns do not exist yet.' });
  }

  const now = new Date();
  const attempts = Number(row.call_attempts ?? 0) + 1;
  const patch: Record<string, unknown> = { call_attempts: attempts, last_call_attempt_at: now.toISOString() };

  let noticeSent = false;
  const lastNotice = row.unreachable_notice_sent_at ? new Date(row.unreachable_notice_sent_at as string).getTime() : 0;
  const recentlyNotified = now.getTime() - lastNotice < 20 * 60 * 60 * 1000;
  if (row.email && !recentlyNotified) {
    const lang: 'en' | 'es' = String(row.source ?? '').startsWith('es:') ? 'es' : 'en';
    const built = buildCallbackMissedEmail({ parentName: String(row.parent_name), phone: (row.phone as string | null) ?? null, attempts, lang });
    const sent = await sendEmail({ to: String(row.email), ...built });
    if (sent.success) {
      noticeSent = true;
      patch.unreachable_notice_sent_at = now.toISOString();
    } else {
      console.error('enquiries: callback-missed email failed', sent.error);
    }
  }

  const { data, error: updErr } = await ctx.admin
    .from('enquiries')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();
  if (updErr) return res.status(500).json({ error: updErr.message });

  await writeAudit(ctx.admin, {
    organizationId: orgId,
    actorUserId: ctx.userId,
    actorRole: 'owner',
    action: 'enquiry.call_attempted',
    entityType: 'enquiry',
    entityId: id,
    payload: { attempts, notice_sent: noticeSent, has_email: !!row.email },
  });

  return res.status(200).json({ enquiry: pick(data), notice_sent: noticeSent, has_email: !!row.email });
}
