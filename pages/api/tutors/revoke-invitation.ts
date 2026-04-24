import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: ownership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .eq('role', 'owner')
    .maybeSingle();
  if (!ownership) return res.status(403).json({ error: 'Only owners can revoke invitations.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return res.status(400).json({ error: 'id is required.' });

  const { data, error: updateErr } = await admin
    .from('tutor_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ownership.organization_id)
    .is('accepted_at', null)
    .select('id');
  if (updateErr) {
    console.error('tutors/revoke-invitation: update failed', updateErr);
    return res.status(500).json({ error: updateErr.message });
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Invitation not found or already accepted.' });
  }

  return res.status(200).json({ ok: true });
}
