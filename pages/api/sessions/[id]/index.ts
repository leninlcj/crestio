import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// PATCH /api/sessions/[id] — generic session update.
// Supports a small allowlist of fields:
//   - duration_minutes (number)
//   - status (string)
//   - subject (string|null)
//   - topic (string|null)
//
// Tutors can only patch their own sessions; owners can patch any session in
// their org. The reschedule endpoint handles scheduled_at + parent emails;
// this endpoint is for lightweight in-app edits like resizing on the calendar.
//
// Also supports DELETE.

const ALLOWED_FIELDS = new Set(['duration_minutes', 'status', 'subject', 'topic', 'paid']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const sessionId = req.query.id as string;
  if (!sessionId) return res.status(400).json({ error: 'Session id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing } = await admin
    .from('sessions')
    .select('id, organization_id, tutor_user_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!existing || existing.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (membership.role === 'tutor' && existing.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only modify your own sessions.' });
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      if (k === 'duration_minutes') {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 15 || n > 480) {
          return res.status(400).json({ error: 'duration_minutes must be 15–480.' });
        }
        update[k] = Math.round(n);
      } else if (k === 'paid') {
        update[k] = !!v;
      } else {
        update[k] = v;
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No supported fields in body.' });
    }
    const { error: updErr } = await admin.from('sessions').update(update).eq('id', sessionId);
    if (updErr) return res.status(500).json({ error: updErr.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Cannot delete a completed session — cancel it instead.' });
    }
    const { error: delErr } = await admin.from('sessions').delete().eq('id', sessionId);
    if (delErr) return res.status(500).json({ error: delErr.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
