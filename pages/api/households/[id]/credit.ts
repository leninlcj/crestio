import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { getBaseUrl } from '../../../../lib/stripe';
import { sendEmail } from '../../../../lib/email';
import { writeAudit } from '../../../../lib/audit';
import { PREPAID_BLOCK } from '../../../../lib/agency';
import { addCreditAdjustment, createPrepaidBlockInvoice, describePrepaidBlock, getHouseholdCredit } from '../../../../lib/householdCredit';
import { buildPrepaidBlockEmail } from '../../../../lib/emails/softRun';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET  /api/households/[id]/credit
//   Balance and ledger for the household. Owner or tutor of the organisation.
// POST /api/households/[id]/credit   (owner only)
//   { kind: 'adjustment', amount_cents, note }
//   { kind: 'block', student_id, hours?, send_email? }   -> creates a prepaid block invoice
//   { kind: 'referred_by', referred_by_household_id | null }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: household } = await admin
    .from('households')
    .select('id, display_name, organization_id, archived_at, referred_by_household_id, referral_credited_at')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!household) return res.status(404).json({ error: 'Household not found.' });

  if (req.method === 'GET') {
    try {
      const credit = await getHouseholdCredit(admin, id);
      let referredBy: { id: string; display_name: string } | null = null;
      if ((household as any).referred_by_household_id) {
        const { data: r } = await admin.from('households').select('id, display_name').eq('id', (household as any).referred_by_household_id).maybeSingle();
        referredBy = (r as any) ?? null;
      }
      return res.status(200).json({
        ...credit,
        referred_by: referredBy,
        referral_credited_at: (household as any).referral_credited_at ?? null,
        block: { hours: PREPAID_BLOCK.hours, discount_percent: PREPAID_BLOCK.discountPercent },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message ?? 'Could not load credit.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (membership.role !== 'owner') return res.status(403).json({ error: 'Only the owner can change credit.' });
  if ((household as any).archived_at) return res.status(400).json({ error: 'This household is archived.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = body.kind;

  try {
    if (kind === 'adjustment') {
      const amount = Number(body.amount_cents);
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return res.status(400).json({ error: 'Amount must be whole cents, not zero, under $10,000.' });
      if (note.length < 3) return res.status(400).json({ error: 'Say why, in a few words. It shows on the family\'s ledger.' });
      const row = await addCreditAdjustment(admin, { organizationId: membership.organization_id, householdId: id, amountCents: amount, note, createdBy: userData.user.id });
      await writeAudit(admin, { organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: 'owner', action: 'credit.adjusted', entityType: 'household', entityId: id, payload: { entity_name: (household as any).display_name, amount_cents: amount, note } });
      const credit = await getHouseholdCredit(admin, id);
      return res.status(200).json({ ok: true, id: row.id, ...credit });
    }

    if (kind === 'block') {
      const studentId = typeof body.student_id === 'string' ? body.student_id : '';
      if (!UUID_RE.test(studentId)) return res.status(400).json({ error: 'Choose the student the block is for.' });
      const { data: student } = await admin
        .from('students').select('id, name, hourly_rate_cents, household_id').eq('id', studentId).eq('household_id', id).maybeSingle();
      if (!student) return res.status(400).json({ error: 'That student is not in this household.' });
      const rate = (student as any).hourly_rate_cents as number | null;
      if (!rate || rate <= 0) return res.status(400).json({ error: 'Set the student\'s hourly rate first; the block is priced from it.' });
      const hours = body.hours == null ? PREPAID_BLOCK.hours : Number(body.hours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 100) return res.status(400).json({ error: 'Hours must be between 1 and 100.' });

      const created = await createPrepaidBlockInvoice(admin, {
        organizationId: membership.organization_id,
        ownerUserId: userData.user.id,
        householdId: id,
        studentId,
        studentName: (student as any).name ?? null,
        rateCents: rate,
        hours,
      });
      const payUrl = created.payment_token ? `${getBaseUrl(req)}/pay/${created.payment_token}` : null;

      let emailed = false;
      if (body.send_email !== false) {
        const { data: hp } = await admin
          .from('household_parents').select('is_primary, parent:parents(name, email)').eq('household_id', id).order('is_primary', { ascending: false }).limit(1);
        const row = ((hp ?? []) as any[])[0];
        const parent = row ? (Array.isArray(row.parent) ? row.parent[0] : row.parent) : null;
        if (parent?.email) {
          const block = describePrepaidBlock({ hours, rateCents: rate, studentName: (student as any).name ?? null });
          const email = buildPrepaidBlockEmail({
            parentName: parent.name ?? null,
            studentName: (student as any).name ?? null,
            hours,
            faceValueCents: block.faceValueCents,
            priceCents: block.priceCents,
            invoiceNumber: created.number,
            payUrl,
          });
          const r = await sendEmail({ to: parent.email, subject: email.subject, html: email.html, text: email.text });
          emailed = r.success;
        }
      }
      await writeAudit(admin, { organizationId: membership.organization_id, actorUserId: userData.user.id, actorRole: 'owner', action: 'credit.block_invoiced', entityType: 'invoice', entityId: created.id, payload: { entity_name: created.number, household_id: id, hours, face_value_cents: created.face_value_cents, total_cents: created.total_cents } });
      return res.status(200).json({ ok: true, invoice: created, pay_url: payUrl, emailed });
    }

    if (kind === 'referred_by') {
      const ref = body.referred_by_household_id;
      if (ref !== null && (typeof ref !== 'string' || !UUID_RE.test(ref))) return res.status(400).json({ error: 'invalid_household' });
      if (ref === id) return res.status(400).json({ error: 'A family cannot refer itself.' });
      if (typeof ref === 'string') {
        const { data: other } = await admin.from('households').select('id').eq('id', ref).eq('organization_id', membership.organization_id).maybeSingle();
        if (!other) return res.status(400).json({ error: 'invalid_household' });
      }
      const { error } = await admin.from('households').update({ referred_by_household_id: ref }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, referred_by_household_id: ref });
    }

    return res.status(400).json({ error: 'Unknown kind.' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Request failed.' });
  }
}
