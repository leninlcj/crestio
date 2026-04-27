import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';

// POST /api/sessions/log-polish-edit
// Tutor-side: log a (raw, edited) pair into session_polish_edits so we
// can later personalize polish (14G). Edit distance is a Levenshtein
// approximation — bag-of-words diff is good enough for the calibration
// signal we're collecting.
//
// Body: { session_id: string; raw_polish: any; edited_polish: any }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const { session_id, raw_polish, edited_polish } = (req.body ?? {}) as {
    session_id?: string;
    raw_polish?: unknown;
    edited_polish?: unknown;
  };
  if (!session_id || typeof session_id !== 'string') return res.status(400).json({ error: 'session_id required' });
  if (!raw_polish || !edited_polish) return res.status(400).json({ error: 'raw_polish and edited_polish required' });

  const distance = approxEditDistance(stringify(raw_polish), stringify(edited_polish));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error: insertErr } = await admin.from('session_polish_edits').insert({
    session_id,
    tutor_id: userId,
    organization_id: membership.organization_id,
    raw_polish,
    edited_polish,
    edit_distance: distance,
  });

  if (insertErr) {
    console.error('[log-polish-edit] insert failed', insertErr);
    return res.status(500).json({ error: 'Could not log edit' });
  }

  // Return the running edit count so the dashboard can decide whether to
  // show the calibration pill (threshold = 20).
  const { count } = await admin
    .from('session_polish_edits')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', userId);

  return res.status(200).json({ ok: true, edits_count: count ?? 0 });
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

// Approximate edit distance — token-level diff, capped to avoid quadratic
// blowup on long notes. Returns words added + words removed, ignoring
// position. Good enough for the signal we want: "did the tutor change a
// little or a lot?"
function approxEditDistance(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  const aBag: Record<string, number> = {};
  const bBag: Record<string, number> = {};
  for (const t of aTokens) aBag[t] = (aBag[t] ?? 0) + 1;
  for (const t of bTokens) bBag[t] = (bBag[t] ?? 0) + 1;
  let added = 0, removed = 0;
  for (const k of Object.keys(bBag)) added += Math.max(0, (bBag[k] ?? 0) - (aBag[k] ?? 0));
  for (const k of Object.keys(aBag)) removed += Math.max(0, (aBag[k] ?? 0) - (bBag[k] ?? 0));
  return added + removed;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
}
