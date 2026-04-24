import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// PATCH /api/user/notification-preferences
// Body: any subset of notify_* boolean columns. Writes to profiles for
// tutors/owners, parents for parent-portal users.
const PROFILE_COLS = new Set([
  'notify_session_reminders',
  'notify_reschedule_events',
  'notify_invoice_events',
  'notify_overdue_alerts',
  'notify_trial_and_billing',
  'notify_messages_email',
  'notify_messages_urgent_only',
]);

const PARENT_COLS = new Set([
  'notify_session_reminders',
  'notify_reschedule_events',
  'notify_invoice_events',
  'notify_parent_updates',
  'notify_messages_email',
  'notify_messages_urgent_only',
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

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

  const body = (req.body ?? {}) as Record<string, unknown>;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Detect identity.
  const { data: profile } = await admin
    .from('profiles').select('id').eq('id', userId).maybeSingle();
  const { data: parent } = await admin
    .from('parents').select('id').eq('auth_user_id', userId).maybeSingle();

  const target = profile ? 'profile' : parent ? 'parent' : null;
  if (!target) return res.status(404).json({ error: 'No profile or parent row for this user.' });

  const allowed = target === 'profile' ? PROFILE_COLS : PARENT_COLS;
  const update: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) continue;
    if (typeof v !== 'boolean') continue;
    update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No valid preference fields supplied.' });
  }

  if (target === 'profile') {
    const { error } = await admin.from('profiles').update(update).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await admin.from('parents').update(update).eq('id', parent!.id);
    if (error) return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, updated: update });
}
