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
    return res.status(403).json({ error: 'Only owners can cancel parent invitations.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const invitationId = typeof body.invitationId === 'string' ? body.invitationId : '';
  if (!invitationId) {
    return res.status(400).json({ error: 'invitationId is required.' });
  }

  const { data, error: deleteErr } = await client
    .from('parent_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('organization_id', organizationId)
    .select('id');
  if (deleteErr) {
    console.error('parents/cancel-invitation: delete failed', deleteErr);
    return res.status(500).json({ error: deleteErr.message });
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Invitation not found or not yours.' });
  }

  return res.status(200).json({ success: true });
}
