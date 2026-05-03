import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Sign a seeded user in by issuing a session via the service-role client and
// stuffing the resulting access token into Supabase's localStorage key. The
// key shape matches @supabase/supabase-js v2's default StorageAdapter.
export async function signInAsSeededUser(page: Page, email: string, password: string) {
  const url = process.env.TEST_SUPABASE_URL!;
  const anon = process.env.TEST_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);

  // Storage key follows pattern: sb-<project-ref>-auth-token
  const projectRef = new URL(url).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionPayload = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    token_type: 'bearer',
    user: data.user,
  });

  // Set on the origin before navigating.
  await page.addInitScript(
    (args: { key: string; value: string }) => {
      window.localStorage.setItem(args.key, args.value);
    },
    { key: storageKey, value: sessionPayload },
  );
}

export function hasTestEnv(): boolean {
  return !!(
    process.env.TEST_SUPABASE_URL &&
    process.env.TEST_SUPABASE_ANON_KEY &&
    process.env.TEST_SUPABASE_SERVICE_ROLE
  );
}
