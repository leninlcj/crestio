import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { resolveActiveToken } from '../../../lib/calendarTokens';
import { buildIcs, type IcsEvent } from '../../../lib/ics';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).send('Server misconfigured.');

  const rawToken = req.query.token;
  const token = typeof rawToken === 'string' ? rawToken : '';
  if (!token) return res.status(401).send('Missing token.');

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const tok = await resolveActiveToken(admin, token);
  if (!tok || tok.audience !== 'parent_student' || !tok.student_id) {
    return res.status(401).send('Invalid or revoked token.');
  }

  const now = new Date();
  const backDate = new Date(now.getTime() - 60 * 86_400_000);
  const forwardDate = new Date(now.getTime() + 180 * 86_400_000);

  const { data: student } = await admin
    .from('students').select('id, name').eq('id', tok.student_id).maybeSingle();

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, updated_at')
    .eq('student_id', tok.student_id)
    .gte('scheduled_at', backDate.toISOString())
    .lte('scheduled_at', forwardDate.toISOString())
    .order('scheduled_at', { ascending: true });

  const studentName = student?.name ?? 'Tutoring';
  const events: IcsEvent[] = ((sessions ?? []) as any[]).map((s) => {
    const start = new Date(s.scheduled_at);
    const end = new Date(start.getTime() + (s.duration_minutes ?? 60) * 60 * 1000);
    const summary = s.subject ? `${studentName} · ${s.subject}` : `${studentName} tutoring`;
    const description = s.status === 'completed' && s.notes_parent_facing
      ? s.notes_parent_facing
      : s.topic ? `Topic: ${s.topic}` : '';
    return {
      uid: s.id,
      summary,
      description: description || null,
      start,
      end,
      lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
      status: s.status === 'cancelled' ? 'CANCELLED' :
              s.status === 'pending_change' ? 'TENTATIVE' : 'CONFIRMED',
    };
  });

  const ics = buildIcs({
    calendarName: `Crestio — ${studentName}`,
    calendarDescription: `Tutoring sessions for ${studentName}.`,
    events,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `inline; filename="crestio-${(studentName || 'student').toLowerCase().replace(/\s+/g, '-')}.ics"`);
  return res.status(200).send(ics);
}
