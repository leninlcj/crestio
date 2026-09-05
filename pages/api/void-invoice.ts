import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { writeAuditBatch } from '../../lib/audit';

// POST /api/void-invoice
// Body: { ids: string[], reason: string }
//
// Invoices are never deleted — they're voided (status='void' + reason recorded).
// This is the "void" model from the lifecycle types.  Voided invoices remain
// visible (muted) so the financial record stays auditable.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { ids?: string[]; reason?: string };
  const ids = (body.ids ?? []).filter((id) => typeof id === 'string');
  if (ids.length === 0) return res.status(400).json({ error: 'No ids provided.' });
  const reason = (body.reason ?? '').trim();
  if (!reason) return res.status(400).json({ error: 'Void reason is required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: rows } = await admin
    .from('invoices')
    .select('id, organization_id, number, status')
    .in('id', ids);
  const visible = (rows ?? []).filter((r: any) =>
    r.organization_id === membership.organization_id && r.status !== 'paid'
  );
  if (visible.length === 0) return res.status(404).json({ error: 'Nothing to void (paid invoices cannot be voided; refund instead).' });

  const visibleIds = visible.map((r: any) => r.id);
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from('invoices')
    .update({ status: 'void', void_reason: reason, voided_by: userId, voided_at: now })
    .in('id', visibleIds);
  if (updErr) return res.status(500).json({ error: updErr.message });

  await writeAuditBatch(
    admin,
    visible.map((row: any) => ({
      organizationId: membership.organization_id,
      actorUserId: userId,
      actorRole: membership.role,
      action: 'invoice.voided',
      entityType: 'invoice',
      entityId: row.id,
      payload: { entity_name: row.number, reason },
    })),
  );

  return res.status(200).json({ ok: true, voided: visibleIds.length });
}
