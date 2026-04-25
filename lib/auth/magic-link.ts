import type { SupabaseClient } from '@supabase/supabase-js';

export type EnsureUserResult =
  | { ok: true; userId: string; magicLink: string; isNewUser: boolean }
  | { ok: false; error: string };

// Look up an existing auth user by email. listUsers paginates at 50; for a
// post-payment lookup the row is almost always recent enough to land on page
// 1, but we walk pages defensively up to a hard cap.
async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const PER_PAGE = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < PER_PAGE) return null;
  }
  return null;
}

// Idempotently get-or-create a Supabase auth user, then mint a magic link
// pointing at redirectTo. The user trigger (handle_new_user) takes care of
// the profile / organization / membership scaffolding for new users.
export async function ensureUserAndMagicLink(opts: {
  admin: SupabaseClient;
  email: string;
  redirectTo: string;
}): Promise<EnsureUserResult> {
  const email = opts.email.trim();
  if (!email) return { ok: false, error: 'Email required' };

  let userId: string | null = null;
  let isNewUser = false;

  const created = await opts.admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created.data?.user?.id) {
    userId = created.data.user.id;
    isNewUser = true;
  } else {
    const msg = (created.error?.message ?? '').toLowerCase();
    const looksLikeExists = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    if (!looksLikeExists) {
      return { ok: false, error: created.error?.message ?? 'createUser failed' };
    }
    userId = await findUserByEmail(opts.admin, email);
    if (!userId) return { ok: false, error: 'User exists but could not be located' };
  }

  const link = await opts.admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: opts.redirectTo },
  });
  if (link.error || !link.data?.properties?.action_link) {
    return { ok: false, error: link.error?.message ?? 'No link returned' };
  }

  return {
    ok: true,
    userId,
    magicLink: link.data.properties.action_link,
    isNewUser,
  };
}
