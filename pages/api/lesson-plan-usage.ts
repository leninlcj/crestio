import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { LESSON_PLAN_DAILY_LIMIT } from '../../lib/rateLimits';
import { getOrganizationIdForUser } from '../../lib/organization';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('lesson-plan-usage: Supabase env vars missing');
    return res.status(500).json({ error: 'Server misconfigured: Supabase env vars missing.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: authErr } = await client.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const userId = userData.user.id;
  const organizationId = await getOrganizationIdForUser(client, userId);
  if (!organizationId) {
    return res.status(500).json({ error: 'No organization found for this account.' });
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error: queryErr } = await client
    .from('lesson_plans')
    .select('created_at')
    .eq('owner_id', userId)
    .eq('organization_id', organizationId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  if (queryErr) {
    console.error('lesson-plan-usage: query failed', queryErr);
    return res.status(500).json({ error: queryErr.message });
  }

  const used = data?.length ?? 0;
  let hoursUntilReset: number | null = null;
  if (used >= LESSON_PLAN_DAILY_LIMIT && data?.[0]?.created_at) {
    const resetAt = new Date(data[0].created_at).getTime() + WINDOW_MS;
    hoursUntilReset = Math.max(1, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)));
  }

  return res.status(200).json({ used, limit: LESSON_PLAN_DAILY_LIMIT, hoursUntilReset });
}
