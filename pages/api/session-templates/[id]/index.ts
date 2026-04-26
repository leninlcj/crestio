import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// PATCH /api/session-templates/[id]
// Updates editable fields. New times take effect for sessions generated from
// the next un-generated date — existing scheduled sessions keep their slot.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const templateId = String(req.query.id ?? '');
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: tpl } = await admin
    .from('session_templates')
    .select('*, student:students!inner(id, name)')
    .eq('id', templateId)
    .maybeSingle();
  if (!tpl || tpl.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Template not found.' });
  }
  if (membership.role === 'tutor' && tpl.tutor_user_id !== userData.user.id) {
    return res.status(403).json({ error: 'You can only edit your own templates.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ template: tpl });
  }

  const body = (req.body ?? {}) as Record<string, any>;
  const update: Record<string, any> = {};
  if (body.subject !== undefined) update.subject = body.subject ? String(body.subject) : null;
  if (body.duration_minutes !== undefined) {
    const d = Number(body.duration_minutes);
    if (!Number.isFinite(d) || d < 15 || d > 480) return res.status(400).json({ error: 'duration_minutes must be 15-480.' });
    update.duration_minutes = d;
  }
  if (body.recurrence_rule !== undefined) {
    if (!['weekly', 'fortnightly', 'monthly'].includes(String(body.recurrence_rule))) {
      return res.status(400).json({ error: 'Invalid recurrence_rule.' });
    }
    update.recurrence_rule = body.recurrence_rule;
  }
  if (body.day_of_week !== undefined) {
    const d = Number(body.day_of_week);
    if (!(d >= 0 && d <= 6)) return res.status(400).json({ error: 'day_of_week must be 0-6.' });
    update.day_of_week = d;
  }
  if (body.start_time_local !== undefined) {
    const s = String(body.start_time_local);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return res.status(400).json({ error: 'Invalid start_time_local.' });
    update.start_time_local = s.length === 5 ? `${s}:00` : s;
  }
  if (body.notes_template !== undefined) {
    update.notes_template = body.notes_template ? String(body.notes_template) : null;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const { error: updateErr } = await admin
    .from('session_templates').update(update).eq('id', templateId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.status(200).json({ ok: true });
}
