import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/assistant/usage
// Returns the caller's assistant usage for "today" (midnight Sydney time).
// Counts user-role rows from assistant_messages. Display-only — the
// authoritative cap still lives in the rate-limit module.
const DAILY_LIMIT = 60;

function midnightSydneyIso(): string {
  // Compute the most recent midnight in Australia/Sydney.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Take Sydney Y/M/D, render as midnight UTC, then shift by Sydney offset.
  const y = get('year'); const m = get('month'); const d = get('day');
  const naiveMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Find Sydney's offset at that instant.
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit', hour12: false,
  }).formatToParts(naiveMidnight);
  const sydHour = Number(tz.find((p) => p.type === 'hour')?.value);
  // sydHour at UTC-midnight-of-Sydney-date = Sydney's offset (0 or 10 or 11 depending on DST).
  const offsetHours = sydHour === 24 ? 0 : sydHour;
  return new Date(naiveMidnight.getTime() - offsetHours * 3_600_000).toISOString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const since = midnightSydneyIso();
  const { count } = await userClient
    .from('assistant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id)
    .eq('role', 'user')
    .gte('created_at', since);

  return res.status(200).json({
    used: count ?? 0,
    limit: DAILY_LIMIT,
    resets_at_midnight_sydney: true,
  });
}
