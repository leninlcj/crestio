import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../lib/ownerAuth';
import { getBaseUrl } from '../../../lib/stripe';

// POST /api/owner/switch-to-test-account — generate a magic-link URL for a
// test account owned by the platform owner.
// This endpoint only accepts target user IDs where is_test_account = TRUE AND
// test_account_owner_user_id = caller. It cannot be used to log in as any real
// user under any circumstance.
// The owner's own session in their current tab is untouched — they open the
// returned login_url in a new tab or incognito window.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const testUserId = typeof body.test_user_id === 'string' ? body.test_user_id : '';
  if (!testUserId) return res.status(400).json({ error: 'test_user_id required.' });

  const { data: target } = await admin
    .from('profiles')
    .select('id, email, is_test_account, test_account_owner_user_id')
    .eq('id', testUserId)
    .maybeSingle();
  if (!target?.is_test_account) {
    return res.status(403).json({ error: 'not_a_test_account' });
  }
  if (target.test_account_owner_user_id !== userId) {
    return res.status(403).json({ error: 'not_your_test_account' });
  }
  if (!target.email) {
    return res.status(400).json({ error: 'Target has no email.' });
  }

  // Close any prior open audit rows for this owner (implicit end of previous
  // test-account switch). Saves running a cron.
  await admin
    .from('test_account_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('owner_user_id', userId)
    .is('ended_at', null);

  // Generate magic link. The Supabase admin API returns an action_link the
  // caller can open in a fresh browser context.
  const baseUrl = getBaseUrl(req);
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
    options: {
      redirectTo: `${baseUrl}/app`,
    },
  });
  if (error || !linkData?.properties?.action_link) {
    console.error('[owner/test-account-switch] link_gen_failed', error);
    return res.status(500).json({ error: error?.message ?? 'link_gen_failed' });
  }

  const ipHeader = req.headers['x-forwarded-for'];
  const ip = Array.isArray(ipHeader) ? ipHeader[0] : (typeof ipHeader === 'string' ? ipHeader.split(',')[0]?.trim() : null);

  await admin.from('test_account_sessions').insert({
    owner_user_id: userId,
    test_account_user_id: testUserId,
    ip_address: ip,
  });

  console.info('[owner/test-account-switch] test_account_switch_started', {
    owner_user_id: userId,
    test_account_user_id: testUserId,
  });

  return res.status(200).json({ login_url: linkData.properties.action_link });
}
