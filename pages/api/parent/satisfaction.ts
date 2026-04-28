import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// POST /api/parent/satisfaction
// Body: { session_id: string; rating: -1 | 1 }
// Writes one row per (session_id, parent_id). Idempotent: re-submitting
// updates the rating.

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

  const { session_id, rating } = (req.body ?? {}) as { session_id?: string; rating?: number };
  if (!session_id || typeof session_id !== 'string') return res.status(400).json({ error: 'session_id required' });
  if (rating !== -1 && rating !== 1) return res.status(400).json({ error: 'rating must be -1 or 1' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Resolve the parent + the org of the session for the row.
  const { data: parent } = await admin
    .from('parents').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!parent) return res.status(403).json({ error: 'No parent account linked.' });

  const { data: sess } = await admin
    .from('sessions').select('organization_id').eq('id', session_id).maybeSingle();
  if (!sess) return res.status(404).json({ error: 'Session not found' });

  const { error: upsertErr } = await admin
    .from('parent_satisfaction')
    .upsert({
      session_id,
      parent_id: (parent as any).id,
      organization_id: (sess as any).organization_id,
      rating,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'session_id,parent_id' });

  if (upsertErr) {
    console.error('[parent/satisfaction] upsert failed', upsertErr);
    return res.status(500).json({ error: 'Could not save rating' });
  }

  return res.status(200).json({ ok: true });
}
