import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { resolveOwnerRequest } from '../../../lib/ownerAuth';

// GET /api/owner/test-accounts
//   Returns the owner's test accounts (profiles + parents) + recent session audit rows.
// POST /api/owner/test-accounts
//   Body: { role: 'tutor' | 'parent', full_name: string, email?: string }
//   Creates an auth user + profile (+ parent row if role=parent) with is_test_account=TRUE.
//   Tutors are inserted as organization_members (role='tutor') in the owner's org.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;

  if (req.method === 'GET') return handleList(ctx, res);
  if (req.method === 'POST') return handleCreate(ctx, req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(ctx: Awaited<ReturnType<typeof resolveOwnerRequest>>, res: NextApiResponse) {
  if (!ctx) return;
  const { admin, userId } = ctx;

  const [{ data: testProfiles }, { data: testParents }, { data: sessions }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, owner_name, is_test_account, created_at')
      .eq('is_test_account', true)
      .eq('test_account_owner_user_id', userId)
      .order('created_at', { ascending: false }),
    admin
      .from('parents')
      .select('id, auth_user_id, email, name, is_test_account, created_at')
      .eq('is_test_account', true)
      .eq('test_account_owner_user_id', userId)
      .order('created_at', { ascending: false }),
    admin
      .from('test_account_sessions')
      .select('id, test_account_user_id, started_at, ended_at, ip_address')
      .eq('owner_user_id', userId)
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  // Figure out last-login per test user from audit log.
  const lastLogin = new Map<string, string>();
  for (const s of (sessions ?? []) as any[]) {
    if (!lastLogin.has(s.test_account_user_id)) {
      lastLogin.set(s.test_account_user_id, s.started_at);
    }
  }

  const tutorRows = ((testProfiles ?? []) as any[]).map((p) => ({
    user_id: p.id,
    role: 'tutor' as const,
    email: p.email,
    name: p.owner_name,
    created_at: p.created_at,
    last_login: lastLogin.get(p.id) ?? null,
  }));
  const parentRows = ((testParents ?? []) as any[]).map((p) => ({
    user_id: p.auth_user_id,
    parent_id: p.id,
    role: 'parent' as const,
    email: p.email,
    name: p.name,
    created_at: p.created_at,
    last_login: p.auth_user_id ? lastLogin.get(p.auth_user_id) ?? null : null,
  }));

  const accounts = [...tutorRows, ...parentRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return res.status(200).json({
    accounts,
    recent_sessions: sessions ?? [],
  });
}

async function handleCreate(
  ctx: Awaited<ReturnType<typeof resolveOwnerRequest>>,
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!ctx) return;
  const { admin, userId } = ctx;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const role = typeof body.role === 'string' ? body.role : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  if (role !== 'tutor' && role !== 'parent') {
    return res.status(400).json({ error: 'role must be "tutor" or "parent".' });
  }
  if (!fullName) {
    return res.status(400).json({ error: 'full_name is required.' });
  }
  const providedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const autoSuffix = randomBytes(4).toString('hex');
  const email = providedEmail || `test-${role}-${autoSuffix}@crestio.test`;
  const initialPassword = `T${randomBytes(16).toString('base64url')}`;

  // Create auth user. email_confirm: true so magic links work immediately.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { test_account: true, created_by: userId, role, full_name: fullName },
  });
  if (createErr || !created?.user?.id) {
    return res.status(500).json({ error: createErr?.message ?? 'Could not create auth user.' });
  }
  const newUserId = created.user.id;

  if (role === 'tutor') {
    // Owner's org
    const { data: myMembership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!myMembership) {
      await admin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Owner has no organization membership.' });
    }

    // Profile row (upsert — handle_new_user trigger may already have inserted one).
    await admin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        owner_name: fullName,
        organization_id: myMembership.organization_id,
        is_test_account: true,
        test_account_owner_user_id: userId,
      }, { onConflict: 'id' });

    // Add as tutor member in the owner's org.
    await admin
      .from('organization_members')
      .upsert({
        organization_id: myMembership.organization_id,
        user_id: newUserId,
        role: 'tutor',
      }, { onConflict: 'organization_id,user_id' });

    // Insert a tutors row so the tutor can accept invitations / appear in
    // assignments. Mark test flag on the profile, tutor row stays clean of
    // flags (we don't have one defined there, by design).
    await admin
      .from('tutors')
      .insert({
        organization_id: myMembership.organization_id,
        owner_id: userId,
        auth_user_id: newUserId,
        name: fullName,
        email,
      });
  } else {
    // parent
    await admin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        owner_name: fullName,
        is_test_account: true,
        test_account_owner_user_id: userId,
      }, { onConflict: 'id' });

    await admin
      .from('parents')
      .upsert({
        auth_user_id: newUserId,
        email,
        name: fullName,
        is_test_account: true,
        test_account_owner_user_id: userId,
      }, { onConflict: 'auth_user_id' });
  }

  return res.status(200).json({
    test_user_id: newUserId,
    email,
    initial_password: initialPassword,
    role,
  });
}
