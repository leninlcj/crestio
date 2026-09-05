import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getBaseUrl } from '../../../lib/stripe';
import { PREPAID_BLOCK } from '../../../lib/agency';
import { getHouseholdCredit, lessonsCovered, createPrepaidBlockInvoice, describePrepaidBlock } from '../../../lib/householdCredit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET  /api/parent/credit
//   The signed-in parent's households: prepaid balance, lessons it covers,
//   recent ledger, and the students a block can be bought for.
// POST /api/parent/credit  { student_id, hours? }
//   Creates a prepaid block invoice for that student's household and returns
//   the pay page URL. The credit lands when the invoice is paid.
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

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: parent } = await admin.from('parents').select('id, email, name').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'No parent account linked.' });

  // Households this parent belongs to, plus any reached through a linked student.
  const householdIds = new Set<string>();
  const { data: hp } = await admin.from('household_parents').select('household_id').eq('parent_id', parent.id);
  for (const r of (hp ?? []) as any[]) householdIds.add(r.household_id);
  const { data: links } = await admin
    .from('parent_student_links')
    .select('student_id, student:students!inner(id, name, household_id, hourly_rate_cents, organization_id, archived)')
    .eq('parent_id', parent.id)
    .is('revoked_at', null);
  const linkedStudents = ((links ?? []) as any[]).map((l) => (Array.isArray(l.student) ? l.student[0] : l.student)).filter(Boolean);
  for (const s of linkedStudents) if (s.household_id) householdIds.add(s.household_id);
  const ids = Array.from(householdIds);

  if (req.method === 'GET') {
    if (ids.length === 0) return res.status(200).json({ households: [], block: { hours: PREPAID_BLOCK.hours, discount_percent: PREPAID_BLOCK.discountPercent } });
    const { data: hhRows } = await admin.from('households').select('id, display_name, organization_id').in('id', ids);
    const { data: studentRows } = await admin
      .from('students').select('id, name, household_id, hourly_rate_cents, archived').in('household_id', ids).eq('archived', false).order('name');
    const out = [];
    for (const h of (hhRows ?? []) as any[]) {
      const credit = await getHouseholdCredit(admin, h.id, 25);
      const students = ((studentRows ?? []) as any[]).filter((s) => s.household_id === h.id);
      const rates = students.map((s) => s.hourly_rate_cents).filter((r) => r && r > 0);
      const rate = rates.length > 0 ? Math.max(...rates) : null;
      out.push({
        id: h.id,
        display_name: h.display_name,
        balance_cents: credit.balance_cents,
        lessons_covered: lessonsCovered(credit.balance_cents, rate),
        setup_required: credit.setup_required,
        ledger: credit.ledger,
        students: students.map((s) => {
          const block = s.hourly_rate_cents && s.hourly_rate_cents > 0 ? describePrepaidBlock({ hours: PREPAID_BLOCK.hours, rateCents: s.hourly_rate_cents, studentName: s.name }) : null;
          return {
            id: s.id,
            name: s.name,
            hourly_rate_cents: s.hourly_rate_cents,
            block: block ? { hours: PREPAID_BLOCK.hours, face_value_cents: block.faceValueCents, price_cents: block.priceCents } : null,
          };
        }),
      });
    }
    return res.status(200).json({ households: out, block: { hours: PREPAID_BLOCK.hours, discount_percent: PREPAID_BLOCK.discountPercent } });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  if (!UUID_RE.test(studentId)) return res.status(400).json({ error: 'Choose a student.' });
  const { data: student } = await admin
    .from('students').select('id, name, household_id, hourly_rate_cents, organization_id, archived').eq('id', studentId).maybeSingle();
  if (!student || !(student as any).household_id || !ids.includes((student as any).household_id)) return res.status(403).json({ error: 'That student is not linked to your account.' });
  const rate = (student as any).hourly_rate_cents as number | null;
  if (!rate || rate <= 0) return res.status(400).json({ error: 'This student has no hourly rate yet. Reply to any Crestio email and we will set it up.' });
  const hours = body.hours == null ? PREPAID_BLOCK.hours : Number(body.hours);
  if (hours !== PREPAID_BLOCK.hours) return res.status(400).json({ error: `Blocks are ${PREPAID_BLOCK.hours} hours.` });

  // One open block invoice per household at a time.
  const { data: open } = await admin
    .from('invoices').select('id, payment_token, number').eq('household_id', (student as any).household_id).eq('is_prepaid_block', true).in('status', ['sent', 'overdue']).limit(1);
  const existing = ((open ?? []) as any[])[0];
  if (existing) {
    return res.status(200).json({ ok: true, existing: true, invoice: { id: existing.id, number: existing.number }, pay_url: existing.payment_token ? `${getBaseUrl(req)}/pay/${existing.payment_token}` : null });
  }

  const { data: org } = await admin.from('organizations').select('owner_user_id').eq('id', (student as any).organization_id).maybeSingle();
  if (!(org as any)?.owner_user_id) return res.status(500).json({ error: 'Organisation owner missing.' });

  try {
    const created = await createPrepaidBlockInvoice(admin, {
      organizationId: (student as any).organization_id,
      ownerUserId: (org as any).owner_user_id,
      householdId: (student as any).household_id,
      studentId,
      studentName: (student as any).name ?? null,
      rateCents: rate,
      hours,
    });
    return res.status(200).json({
      ok: true,
      invoice: { id: created.id, number: created.number, total_cents: created.total_cents, face_value_cents: created.face_value_cents },
      pay_url: created.payment_token ? `${getBaseUrl(req)}/pay/${created.payment_token}` : null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Could not create the block.' });
  }
}
