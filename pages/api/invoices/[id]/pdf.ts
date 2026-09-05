import type { NextApiRequest, NextApiResponse } from 'next';
import { isPlatformOwner } from '../../../../lib/owner';
import { getBaseUrl } from '../../../../lib/stripe';
import { buildAgencyInvoiceNote } from '../../../../lib/agencyInvoice';
import { createClient } from '@supabase/supabase-js';
import { renderInvoicePdf } from '../../../../lib/pdf/invoice';

// GET /api/invoices/:id/pdf returns the invoice as a downloadable PDF.
// Authorization: the tutor (membership) OR the parent linked to the invoice.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const id = (Array.isArray(req.query.id) ? req.query.id[0] : req.query.id) ?? '';
  if (!id) return res.status(400).json({ error: 'id required' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: invoice } = await admin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // Authorization.
  const orgId = (invoice as any).organization_id as string;
  const parentId = (invoice as any).parent_id as string | null;
  let authorized = false;
  const { data: m } = await admin
    .from('memberships').select('id').eq('user_id', userData.user.id).eq('organization_id', orgId).maybeSingle();
  if (m) authorized = true;
  if (!authorized) {
    // organization_members is the membership table the app writes; memberships
    // is the older one some production rows still use. Accept either.
    const { data: m2 } = await admin
      .from('organization_members').select('user_id').eq('user_id', userData.user.id).eq('organization_id', orgId).maybeSingle();
    if (m2) authorized = true;
  }
  if (!authorized) {
    const { data: parentRow } = await admin
      .from('parents').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
    const myParentId = (parentRow as any)?.id as string | undefined;
    if (myParentId) {
      if (parentId && myParentId === parentId) authorized = true;
      // Household invoices: any parent of the household may download.
      if (!authorized && (invoice as any).household_id) {
        const { data: hp } = await admin
          .from('household_parents').select('id').eq('household_id', (invoice as any).household_id).eq('parent_id', myParentId).maybeSingle();
        if (hp) authorized = true;
      }
      // Single-student invoices: a parent linked to that student.
      if (!authorized && (invoice as any).student_id) {
        const { data: psl } = await admin
          .from('parent_student_links').select('id').eq('student_id', (invoice as any).student_id).eq('parent_id', myParentId).is('revoked_at', null).maybeSingle();
        if (psl) authorized = true;
      }
    }
  }
  if (!authorized) return res.status(403).json({ error: 'Not authorized' });

  // Fetch parent + student + org for the PDF.
  const [{ data: parent }, { data: student }, { data: org }] = await Promise.all([
    parentId
      ? admin.from('parents').select('name, email').eq('id', parentId).maybeSingle()
      : Promise.resolve({ data: null }),
    (invoice as any).student_id
      ? admin.from('students').select('name').eq('id', (invoice as any).student_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('organizations').select('name, brand_color, owner_user_id').eq('id', orgId).maybeSingle(),
  ]);

  let tutorName: string | null = null;
  let agencyNote: string | null = null;
  if ((org as any)?.owner_user_id) {
    const { data: tp } = await admin.from('profiles').select('full_name, email').eq('id', (org as any).owner_user_id).maybeSingle();
    tutorName = (tp as any)?.full_name ?? null;
    // Agency model: the lesson is delivered by the student's tutor; Crestio
    // collects payment on the tutor's behalf and keeps a service fee. The
    // note names the tutor and shows the fee split.
    if (isPlatformOwner((tp as any)?.email)) {
      agencyNote = await buildAgencyInvoiceNote(admin, {
        invoiceId: (invoice as any).id,
        studentId: (invoice as any).student_id ?? null,
        ownerUserId: (org as any).owner_user_id,
        totalCents: (invoice as any).subtotal_cents ?? (invoice as any).total_cents ?? 0,
        currency: (invoice as any).currency ?? 'AUD',
        isPrepaidBlock: Boolean((invoice as any).is_prepaid_block),
        prepaidHours: (invoice as any).prepaid_hours != null ? Number((invoice as any).prepaid_hours) : null,
      });
    }
  }

  // Line items: the line_items JSON when present, otherwise the sessions on the
  // invoice (batch invoices record them in invoice_sessions; single invoices
  // point sessions.invoice_id at the invoice). Before chunk 5 neither path
  // reached the PDF, so every PDF printed an empty table.
  let lineItems: any[] = Array.isArray((invoice as any).line_items) ? (invoice as any).line_items : [];
  if (lineItems.length === 0) {
    lineItems = await lineItemsFromSessions(admin, (invoice as any).id);
  }

  // Household invoices bill the household's primary parent when no parent_id is set.
  let billedName = (parent as any)?.name ?? '';
  let billedEmail = (parent as any)?.email ?? null;
  if (!billedName && (invoice as any).household_id) {
    const { data: hp } = await admin
      .from('household_parents')
      .select('is_primary, parent:parents(name, email)')
      .eq('household_id', (invoice as any).household_id)
      .order('is_primary', { ascending: false })
      .limit(1);
    const row = ((hp ?? []) as any[])[0];
    const p = row ? (Array.isArray(row.parent) ? row.parent[0] : row.parent) : null;
    if (p) { billedName = p.name ?? ''; billedEmail = p.email ?? null; }
    if (!billedName) {
      const { data: hh } = await admin.from('households').select('display_name').eq('id', (invoice as any).household_id).maybeSingle();
      billedName = (hh as any)?.display_name ?? '';
    }
  }

  // The pay page link doubles as the PDF's payment URL when no Stripe payment link was stored.
  const paymentUrl = (invoice as any).payment_link_url
    ?? ((invoice as any).payment_token ? `${getBaseUrl(req)}/pay/${(invoice as any).payment_token}` : null);

  const pdf = await renderInvoicePdf({
    agencyNote,
    org: {
      name: (org as any)?.name ?? 'Tutoring',
      color: (org as any)?.brand_color ?? null,
      tutorName,
    },
    invoice: {
      number: (invoice as any).number,
      issued_on: (invoice as any).issued_on,
      due_on: (invoice as any).due_on,
      status: (invoice as any).status,
      parent_name: billedName,
      parent_email: billedEmail,
      student_name: (student as any)?.name ?? null,
      notes: (invoice as any).notes,
      payment_link_url: paymentUrl,
      currency: (invoice as any).currency ?? 'AUD',
      total_cents: (invoice as any).total_cents,
      subtotal_cents: (invoice as any).subtotal_cents ?? (invoice as any).total_cents,
      tax_cents: (invoice as any).tax_cents ?? 0,
      credit_applied_cents: (invoice as any).credit_applied_cents ?? 0,
      line_items: lineItems.map((li: any) => ({
        description: li.description ?? li.label ?? 'Tutoring session',
        qty: li.qty ?? li.hours ?? 1,
        rate_cents: li.rate_cents ?? 0,
        amount_cents: li.amount_cents ?? li.total_cents ?? 0,
      })),
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, max-age=300');
  const filename = `invoice-${(invoice as any).number}.pdf`;
  if ((Array.isArray(req.query.download) ? req.query.download[0] : req.query.download)) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  }
  res.status(200).send(Buffer.from(pdf));
}

// Sessions on an invoice, as PDF line items, newest last.
async function lineItemsFromSessions(admin: any, invoiceId: string): Promise<Array<{ description: string; qty: number; rate_cents: number; amount_cents: number }>> {
  const { data: links } = await admin
    .from('invoice_sessions')
    .select('session_id, hourly_rate_cents, duration_minutes, amount_cents, line_item_description')
    .eq('invoice_id', invoiceId);
  const linked = (links ?? []) as any[];
  if (linked.length > 0) {
    return linked.map((l) => ({
      description: l.line_item_description ?? 'Tutoring session',
      qty: Math.round(((l.duration_minutes ?? 60) / 60) * 100) / 100,
      rate_cents: l.hourly_rate_cents ?? 0,
      amount_cents: l.amount_cents ?? 0,
    }));
  }
  const { data: sessions } = await admin
    .from('sessions')
    .select('scheduled_at, duration_minutes, subject, topic, charge_rate_cents, status, late_cancellation, student:students(name, hourly_rate_cents)')
    .eq('invoice_id', invoiceId)
    .order('scheduled_at', { ascending: true });
  return ((sessions ?? []) as any[]).map((s) => {
    const student = Array.isArray(s.student) ? s.student[0] : s.student;
    const rate = s.charge_rate_cents ?? student?.hourly_rate_cents ?? 0;
    const minutes = s.duration_minutes ?? 60;
    const when = new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
    const parts = [when, student?.name ?? null, s.subject ?? null, s.topic ?? null, `${minutes} min`, s.status === 'cancelled' && s.late_cancellation ? 'Late cancellation' : null].filter(Boolean);
    return {
      description: parts.join(' / '),
      qty: Math.round((minutes / 60) * 100) / 100,
      rate_cents: rate,
      amount_cents: Math.round((rate * minutes) / 60),
    };
  });
}
