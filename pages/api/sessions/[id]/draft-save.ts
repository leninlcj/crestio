import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationIdForUser } from '../../../../lib/organization';
import { getMembershipForUser } from '../../../../lib/membership';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('draft-save: Supabase env vars missing');
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Invalid session id.' });
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
  if (membership?.role === 'tutor' && typeof id === 'string') {
    const { data: sessionRow } = await client
      .from('sessions')
      .select('tutor_user_id')
      .eq('id', id)
      .maybeSingle();
    if (!sessionRow || (sessionRow as any).tutor_user_id !== userData.user.id) {
      return res.status(403).json({ error: 'You can only edit your own sessions.' });
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const notesInternal = typeof body.notesInternal === 'string' ? body.notesInternal : '';
  const notesParentFacing = typeof body.notesParentFacing === 'string' ? body.notesParentFacing : '';
  const homeworkDescription = typeof body.homeworkDescription === 'string'
    ? body.homeworkDescription
    : (typeof body.homework === 'string' ? body.homework : '');
  const homeworkDueDate = typeof body.homeworkDueDate === 'string' ? body.homeworkDueDate : '';
  const nextSessionFocus = typeof body.nextSessionFocus === 'string' ? body.nextSessionFocus : '';

  const { data, error: updateErr } = await client
    .from('sessions')
    .update({
      notes_internal: notesInternal || null,
      notes_parent_facing: notesParentFacing || null,
      homework: homeworkDescription || null,
      homework_description: homeworkDescription || null,
      homework_due_date: homeworkDueDate || null,
      next_session_focus: nextSessionFocus || null,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id');

  if (updateErr) {
    console.error('draft-save: update failed', updateErr);
    return res.status(500).json({ error: updateErr.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  return res.status(200).json({ saved: true, savedAt: new Date().toISOString() });
}
