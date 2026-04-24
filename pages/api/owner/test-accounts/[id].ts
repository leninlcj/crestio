import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';

// DELETE /api/owner/test-accounts/[id]
// Deletes the auth user + cascades. Only works if the target is actually a
// test account owned by the calling owner.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;

  const targetUserId = req.query.id as string;
  if (!targetUserId) return res.status(400).json({ error: 'id required.' });

  // Confirm: target has a profile marked is_test_account owned by caller.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_test_account, test_account_owner_user_id')
    .eq('id', targetUserId)
    .maybeSingle();
  // Profile may not exist if only a parent row was created; also check there.
  const { data: parentRow } = await admin
    .from('parents')
    .select('auth_user_id, is_test_account, test_account_owner_user_id')
    .eq('auth_user_id', targetUserId)
    .maybeSingle();

  const isOwned =
    (profile?.is_test_account && profile.test_account_owner_user_id === userId) ||
    (parentRow?.is_test_account && parentRow.test_account_owner_user_id === userId);
  if (!isOwned) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Cascade via auth.users → profiles/parents (FK ON DELETE CASCADE on
  // test_account_owner_user_id means owner-deletion would cascade these too,
  // but deleting the test user itself is what we want). Auth user delete
  // triggers the existing handle_new_user cascade on profile/parent rows.
  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) return res.status(500).json({ error: error.message });

  // Defensive: explicitly remove profile/parent rows in case cascade doesn't
  // cover everything (handle_new_user only inserts a profile on signup).
  await admin.from('parents').delete().eq('auth_user_id', targetUserId);
  await admin.from('profiles').delete().eq('id', targetUserId);

  return res.status(200).json({ ok: true });
}
