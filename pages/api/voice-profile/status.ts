import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// GET /api/voice-profile/status
// Returns the authenticated tutor's voice-profile state for the
// /app/settings/voice dashboard. Read-only; no service role.

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

  const { data: profile, error } = await userClient
    .from('profiles')
    .select('voice_profile_summary, voice_profile_updated_at, voice_profile_sample_count')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    summary: (profile as any)?.voice_profile_summary ?? null,
    updated_at: (profile as any)?.voice_profile_updated_at ?? null,
    sample_count: (profile as any)?.voice_profile_sample_count ?? 0,
  });
}
