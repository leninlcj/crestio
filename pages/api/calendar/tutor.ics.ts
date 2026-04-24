import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { resolveActiveToken } from '../../../lib/calendarTokens';
import { buildIcs, type IcsEvent } from '../../../lib/ics';

export const config = { api: { bodyParser: false } };

// Public endpoint — token in URL is the only auth. Returns text/calendar.
// Feeds sessions for the next 180 days forward and 60 days back.
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
  if (!tok || tok.audience !== 'tutor') {
    return res.status(401).send('Invalid or revoked token.');
  }

  const now = new Date();
  const backDate = new Date(now.getTime() - 60 * 86_400_000);
  const forwardDate = new Date(now.getTime() + 180 * 86_400_000);

  // We need to find the user's organization to scope sessions.
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', tok.user_id)
    .maybeSingle();
  if (!membership) return res.status(404).send('No organization.');

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, subject, topic, status, notes_parent_facing, updated_at, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .eq('tutor_user_id', tok.user_id)
    .gte('scheduled_at', backDate.toISOString())
    .lte('scheduled_at', forwardDate.toISOString())
    .order('scheduled_at', { ascending: true });

  const events: IcsEvent[] = ((sessions ?? []) as any[]).map((s) => {
    const start = new Date(s.scheduled_at);
    const end = new Date(start.getTime() + (s.duration_minutes ?? 60) * 60 * 1000);
    const studentName = s.student?.name ?? 'Tutoring';
    const summary = s.subject ? `${studentName} · ${s.subject}` : studentName;
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
    calendarName: 'Crestio — Your sessions',
    calendarDescription: 'Tutoring sessions synced from Crestio.',
    events,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline; filename="crestio-tutor.ics"');
  return res.status(200).send(ics);
}
