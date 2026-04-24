import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isPlatformOwner } from './owner';
import { checkRateLimit, LIMITS } from './rateLimit';

export type OwnerContext = {
  userId: string;
  email: string;
  userClient: SupabaseClient;
  admin: SupabaseClient;
};

// Resolve the current session, enforce platform-owner, rate-limit.
// Returns null after already writing a 403 / 401 / 500 / 429 to res.
export async function resolveOwnerRequest(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<OwnerContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    res.status(500).json({ error: 'Server misconfigured.' });
    return null;
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) {
    // 403, not 401: don't signal that the endpoint exists.
    res.status(403).json({ error: 'forbidden' });
    return null;
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error } = await userClient.auth.getUser(token);
  if (error || !userData?.user?.email) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  if (!isPlatformOwner(userData.user.email)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }

  const rl = checkRateLimit({
    key: `owner_admin:${userData.user.id}`,
    limit: LIMITS.owner_admin.limit,
    windowMs: LIMITS.owner_admin.windowMs,
  });
  if (!rl.allowed) {
    res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
    return null;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return { userId: userData.user.id, email: userData.user.email, userClient, admin };
}
