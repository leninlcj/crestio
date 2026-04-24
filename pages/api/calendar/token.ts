import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  getOrCreateCalendarToken,
  revokeCalendarToken,
  type CalendarTokenAudience,
} from '../../../lib/calendarTokens';

// Generate/revoke/rotate a calendar access token.
// POST { audience, student_id?, rotate? } → { token, url }
// DELETE ?id=... → revokes the given token id (caller must own it).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      audience?: string;
      student_id?: string | null;
      rotate?: boolean;
    };
    const audience = (body.audience ?? '') as CalendarTokenAudience;
    if (audience !== 'tutor' && audience !== 'parent' && audience !== 'parent_student') {
      return res.status(400).json({ error: 'Invalid audience.' });
    }
    const studentId = body.student_id ?? null;

    // If rotate=true, revoke existing then create fresh.
    if (body.rotate === true) {
      let rq = admin
        .from('calendar_access_tokens').select('id')
        .eq('user_id', userId).eq('audience', audience).is('revoked_at', null);
      if (studentId === null) rq = rq.is('student_id', null);
      else rq = rq.eq('student_id', studentId);
      const { data: existing } = await rq;
      for (const t of (existing ?? []) as Array<{ id: string }>) {
        await revokeCalendarToken(admin, t.id, userId);
      }
    }

    const result = await getOrCreateCalendarToken(admin, { userId, audience, studentId });
    const origin = originFromReq(req);
    const endpoint = audience === 'tutor'
      ? `${origin}/api/calendar/tutor.ics?token=${result.token}`
      : `${origin}/api/calendar/parent-student.ics?token=${result.token}`;
    return res.status(200).json({ token: result.token, url: endpoint, created: result.created });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id required.' });
    await revokeCalendarToken(admin, id, userId);
    return res.status(200).json({ revoked: true });
  }

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

function originFromReq(req: NextApiRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const host = req.headers.host ?? 'crestio.ai';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}
