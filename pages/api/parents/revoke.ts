import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationIdForUser } from '../../../lib/organization';
import { getMembershipForUser } from '../../../lib/membership';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
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
  const organizationId = await getOrganizationIdForUser(client, userData.user.id);
  if (!organizationId) {
    return res.status(500).json({ error: 'No organization found for this account.' });
  }
  const membership = await getMembershipForUser(client, userData.user.id);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can revoke parent access.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const linkId = typeof body.linkId === 'string' ? body.linkId : '';
  if (!linkId) {
    return res.status(400).json({ error: 'linkId is required.' });
  }

  const { data, error: updateErr } = await client
    .from('parent_student_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('organization_id', organizationId)
    .select('id');
  if (updateErr) {
    console.error('parents/revoke: update failed', updateErr);
    return res.status(500).json({ error: updateErr.message });
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Link not found or not yours.' });
  }

  return res.status(200).json({ success: true });
}
