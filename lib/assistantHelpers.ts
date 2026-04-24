import type { NextApiRequest } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser, Membership } from './membership';

export type AssistantCallerContext = {
  userClient: SupabaseClient;
  userId: string;
  userEmail: string;
  membership: Membership;
};

export type AuthFailure = { error: string; status: number };

export async function resolveAssistantCaller(
  req: NextApiRequest,
): Promise<AssistantCallerContext | AuthFailure> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: 'Server misconfigured (Supabase).', status: 500 };

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { error: 'Not authenticated.', status: 401 };

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return { error: 'Not authenticated.', status: 401 };

  const userId = userData.user.id;
  const userEmail = userData.user.email ?? '';

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return { error: 'No organization membership found.', status: 403 };

  return { userClient, userId, userEmail, membership };
}

export function isAuthFailure(
  x: AssistantCallerContext | AuthFailure,
): x is AuthFailure {
  return (x as AuthFailure).status !== undefined;
}
