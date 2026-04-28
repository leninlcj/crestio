import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { renderInvoicePdf } from '../../../../lib/pdf/invoice';

// GET /api/invoices/:id/pdf — returns the invoice as a downloadable PDF.
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
    .select('id, number, issued_on, due_on, status, parent_id, organization_id, student_id, notes, payment_link_url, currency, total_cents, subtotal_cents, tax_cents, line_items')
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
  if (!authorized && parentId) {
    const { data: parent } = await admin
      .from('parents').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
    if ((parent as any)?.id === parentId) authorized = true;
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
  if ((org as any)?.owner_user_id) {
    const { data: tp } = await admin.from('profiles').select('full_name').eq('id', (org as any).owner_user_id).maybeSingle();
    tutorName = (tp as any)?.full_name ?? null;
  }

  const lineItems = Array.isArray((invoice as any).line_items) ? (invoice as any).line_items : [];

  const pdf = await renderInvoicePdf({
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
      parent_name: (parent as any)?.name ?? '',
      parent_email: (parent as any)?.email ?? null,
      student_name: (student as any)?.name ?? null,
      notes: (invoice as any).notes,
      payment_link_url: (invoice as any).payment_link_url,
      currency: (invoice as any).currency ?? 'AUD',
      total_cents: (invoice as any).total_cents,
      subtotal_cents: (invoice as any).subtotal_cents ?? (invoice as any).total_cents,
      tax_cents: (invoice as any).tax_cents ?? 0,
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
