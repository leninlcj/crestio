import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { buildIcs, type IcsEvent } from '../../../lib/ics';

// GET /api/calendar/student.ics?token=...
// Token-authenticated iCal feed of the student's own sessions only.
// Token is stored in student_portal_access.calendar_token (rotatable).

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).send('Server misconfigured.');

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(401).send('Missing token.');

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: access } = await admin
    .from('student_portal_access')
    .select('id, student_id, enabled, disabled_at')
    .eq('calendar_token', token)
    .maybeSingle();
  if (!access || !access.enabled || access.disabled_at) {
    return res.status(401).send('Invalid or revoked token.');
  }

  const { data: student } = await admin
    .from('students').select('name, organization_id').eq('id', access.student_id).maybeSingle();

  const now = new Date();
  const back = new Date(now.getTime() - 60 * 86400_000);
  const fwd = new Date(now.getTime() + 180 * 86400_000);
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, updated_at')
    .eq('student_id', access.student_id)
    .is('deleted_at', null)
    .gte('scheduled_at', back.toISOString())
    .lte('scheduled_at', fwd.toISOString())
    .order('scheduled_at', { ascending: true });

  const events: IcsEvent[] = ((sessions ?? []) as any[]).map((s) => {
    const start = new Date(s.scheduled_at);
    const end = new Date(start.getTime() + (s.duration_minutes ?? 60) * 60 * 1000);
    return {
      uid: s.id,
      summary: s.subject ? `${s.subject} tutoring` : 'Tutoring',
      description: s.topic || null,
      start,
      end,
      lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
      status: s.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    };
  });

  const ics = buildIcs({
    calendarName: `Tutoring · ${student?.name ?? 'me'}`,
    calendarDescription: 'Your tutoring sessions.',
    events,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline; filename="my-tutoring.ics"');
  return res.status(200).send(ics);
}
