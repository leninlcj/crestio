import type { NextApiRequest, NextApiResponse } from 'next';
import { isPlatformOwner } from '../../../../lib/owner';
import { agencyInvoiceNote } from '../../../../lib/agency';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../../../lib/rateLimit';

// GET /api/pay/[token]
// Public — no auth. Returns the org/invoice info needed to render the
// /pay/[token] page. Rate-limited 10/min/IP.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ip = fwd.split(',')[0]?.trim() || (req.socket.remoteAddress ?? 'unknown');
  const rl = checkRateLimit({ key: `pay_view:${ip}`, limit: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const tokenParam = typeof req.query.token === 'string' ? req.query.token : '';
  if (!tokenParam || tokenParam.length < 16) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, organization_id, number, total_cents, status, currency, due_on, issued_on, payment_token, household_id, student_id')
    .eq('payment_token', tokenParam)
    .maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'Not found.' });

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, stripe_connect_status, stripe_connect_charges_enabled, owner_user_id')
    .eq('id', (invoice as any).organization_id)
    .maybeSingle();
  if (!org) return res.status(404).json({ error: 'Not found.' });

  // Agency disclosure (introduction-agency model) for the agency org only.
  let agencyNote: string | null = null;
  if ((org as any).owner_user_id) {
    const { data: ownerProfile } = await admin.from('profiles').select('email').eq('id', (org as any).owner_user_id).maybeSingle();
    if (isPlatformOwner((ownerProfile as any)?.email)) {
      let lessonTutor: string | null = null;
      if ((invoice as any).student_id) {
        const { data: st } = await admin.from('students').select('primary_tutor_id').eq('id', (invoice as any).student_id).maybeSingle();
        if ((st as any)?.primary_tutor_id) {
          const { data: tu } = await admin.from('tutors').select('name').eq('id', (st as any).primary_tutor_id).maybeSingle();
          lessonTutor = (tu as any)?.name ?? null;
        }
      }
      agencyNote = agencyInvoiceNote(lessonTutor);
    }
  }

  const inv = invoice as {
    id: string;
    number: string;
    total_cents: number;
    status: string;
    currency: string;
    due_on: string | null;
    issued_on: string;
    household_id: string | null;
    student_id: string | null;
  };

  // Display name for the invoice subject.
  let billedToLabel: string | null = null;
  if (inv.household_id) {
    const { data: hh } = await admin
      .from('households').select('display_name').eq('id', inv.household_id).maybeSingle();
    billedToLabel = (hh as any)?.display_name ?? null;
  } else if (inv.student_id) {
    const { data: stu } = await admin
      .from('students').select('name').eq('id', inv.student_id).maybeSingle();
    billedToLabel = (stu as any)?.name ?? null;
  }

  // Optional sibling invoices (other unpaid for the same household/student) so
  // a parent can pay a "stack" without leaving the page.
  let siblingInvoices: Array<{ token: string; number: string; total_cents: number; due_on: string | null }> = [];
  const siblingKey: { col: 'household_id' | 'student_id'; val: string } | null =
    inv.household_id ? { col: 'household_id', val: inv.household_id } :
    inv.student_id ? { col: 'student_id', val: inv.student_id } : null;
  if (siblingKey) {
    const { data: sibs } = await admin
      .from('invoices')
      .select('id, number, total_cents, due_on, status, payment_token')
      .eq('organization_id', (invoice as any).organization_id)
      .eq(siblingKey.col, siblingKey.val)
      .neq('id', inv.id)
      .in('status', ['sent', 'overdue', 'draft'])
      .order('due_on', { ascending: true })
      .limit(20);
    siblingInvoices = ((sibs ?? []) as any[])
      .filter((s) => s.payment_token && s.total_cents > 0)
      .map((s) => ({ token: s.payment_token, number: s.number, total_cents: s.total_cents, due_on: s.due_on }));
  }

  return res.status(200).json({
    org: {
      name: (org as any).name,
      charges_enabled: Boolean((org as any).stripe_connect_charges_enabled),
      status: (org as any).stripe_connect_status,
      agency_note: agencyNote,
    },
    invoice: {
      id: inv.id,
      number: inv.number,
      total_cents: inv.total_cents,
      currency: inv.currency,
      status: inv.status,
      due_on: inv.due_on,
      issued_on: inv.issued_on,
      billed_to: billedToLabel,
    },
    sibling_invoices: siblingInvoices,
  });
}
