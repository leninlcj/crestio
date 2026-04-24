import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../lib/ownerAuth';

// PATCH /api/owner/billing-exemption  { active: boolean }
// GET   /api/owner/billing-exemption  → { active: boolean }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;

  if (req.method === 'GET') {
    const { data } = await admin
      .from('profiles')
      .select('billing_exemption_active, show_test_accounts_in_lists')
      .eq('id', userId)
      .maybeSingle();
    return res.status(200).json({
      active: data?.billing_exemption_active ?? true,
      show_test_accounts_in_lists: data?.show_test_accounts_in_lists ?? false,
    });
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, any> = {};
    if (typeof body.active === 'boolean') update.billing_exemption_active = body.active;
    if (typeof body.show_test_accounts_in_lists === 'boolean') {
      update.show_test_accounts_in_lists = body.show_test_accounts_in_lists;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }
    const { error } = await admin.from('profiles').update(update).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
