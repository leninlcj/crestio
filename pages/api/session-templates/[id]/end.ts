import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { cancelFutureSessionsForTemplate } from '../../../../lib/sessionGeneration';

// POST /api/session-templates/[id]/end
// Body: { cancel_future_sessions?: boolean }
// Ends a recurring template. Optionally cancels already-generated future
// sessions linked to it; otherwise they stay scheduled as one-offs.
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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const templateId = req.query.id as string;
  const cancelFuture = (req.body ?? {}).cancel_future_sessions === true;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: tpl } = await admin
    .from('session_templates')
    .select('id, organization_id, tutor_user_id, cancelled_at')
    .eq('id', templateId)
    .maybeSingle();
  if (!tpl || tpl.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Template not found.' });
  }
  if (membership.role === 'tutor' && tpl.tutor_user_id !== userData.user.id) {
    return res.status(403).json({ error: 'You can only end your own recurring schedules.' });
  }
  if (tpl.cancelled_at) {
    return res.status(400).json({ error: 'Template is already ended.' });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('session_templates')
    .update({ cancelled_at: now, effective_until: now.slice(0, 10) })
    .eq('id', templateId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  let cancelled = 0;
  if (cancelFuture) {
    cancelled = await cancelFutureSessionsForTemplate(admin, templateId);
  }

  return res.status(200).json({ ok: true, future_sessions_cancelled: cancelled });
}
