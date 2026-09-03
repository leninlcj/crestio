import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '../../../lib/notifications';
import { formatAuDateTime } from '../../../lib/sessionChanges';
import { getBaseUrl } from '../../../lib/stripe';

// Vercel Cron. Two cadences:
//   * daily (default; Vercel Hobby allows one run per day): runs at 06:00
//     Sydney. Tutors get a "today at 4:00 pm" reminder for every session on
//     today's Sydney date; parents get a "tomorrow at 4:00 pm" reminder for
//     every session on tomorrow's Sydney date.
//   * frequent (CRON_REMINDER_MODE=frequent, needs a Pro plan and a */15
//     schedule): the original 45–75 min tutor window and 24h parent window.
// Dedupe via notification_dispatch_log so re-runs never double-fire.
const TZ = 'Australia/Sydney';

function sydneyDayBounds(offsetDays: number): { fromIso: string; toIso: string } {
  // Midnight-to-midnight of (today + offsetDays) in Sydney, expressed in UTC.
  const nowSyd = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const y = nowSyd.getFullYear();
  const m = nowSyd.getMonth();
  const d = nowSyd.getDate() + offsetDays;
  const localMidnight = new Date(y, m, d, 0, 0, 0, 0);
  const localNext = new Date(y, m, d + 1, 0, 0, 0, 0);
  // Convert a Sydney wall-clock time to UTC by measuring the zone offset at that instant.
  const toUtc = (wall: Date) => {
    const asUtc = new Date(Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes()));
    const sydAtThat = new Date(asUtc.toLocaleString('en-US', { timeZone: TZ }));
    const offsetMs = sydAtThat.getTime() - new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(asUtc.getTime() - offsetMs);
  };
  return { fromIso: toUtc(localMidnight).toISOString(), toIso: toUtc(localNext).toISOString() };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const startedAt = new Date().toISOString();
  const baseUrl = getBaseUrl(req);
  let created = 0;
  let dupes = 0;
  const errors: string[] = [];

  const frequent = process.env.CRON_REMINDER_MODE === 'frequent';

  // ------ Tutor reminder: today's sessions (daily) or 45–75 min ahead (frequent)
  try {
    const nowMs = Date.now();
    const { fromIso, toIso } = frequent
      ? { fromIso: new Date(nowMs + 45 * 60_000).toISOString(), toIso: new Date(nowMs + 75 * 60_000).toISOString() }
      : { fromIso: new Date(Math.max(nowMs, new Date(sydneyDayBounds(0).fromIso).getTime())).toISOString(), toIso: sydneyDayBounds(0).toIso };
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, student:students!inner(id, name), tutor_user_id, status')
      .eq('status', 'scheduled')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso);

    for (const s of (sessions ?? []) as any[]) {
      if (!s.tutor_user_id) continue;
      const result = await createNotification(admin, {
        userId: s.tutor_user_id,
        type: 'session_reminder_1h',
        titleKey: frequent ? 'session_reminder_1h.title' : 'session_reminder_today.title',
        bodyKey: frequent ? 'session_reminder_1h.body' : 'session_reminder_today.body',
        templateVars: {
          student: s.student?.name ?? 'student',
          time: frequent ? formatAuDateTime(s.scheduled_at) : formatTime(s.scheduled_at),
          duration: s.duration_minutes,
          subject: s.subject ?? '',
        },
        linkUrl: `/app/sessions/${s.id}`,
        context: { session_id: s.id, student_id: s.student?.id },
        dedupeKey: `session_reminder_1h:${s.id}`,
        baseUrl,
      });
      if (result.ok) created++;
      else if (result.reason === 'dedupe') dupes++;
      else errors.push(`1h:${s.id}:${result.error ?? 'unknown'}`);
    }
  } catch (e: any) {
    errors.push(`1h:scan:${e?.message ?? 'unknown'}`);
  }

  // ------ Parent reminder: tomorrow's sessions (daily) or 23h45–24h15 ahead (frequent)
  try {
    const nowMs = Date.now();
    const { fromIso, toIso } = frequent
      ? { fromIso: new Date(nowMs + (23 * 60 + 45) * 60_000).toISOString(), toIso: new Date(nowMs + (24 * 60 + 15) * 60_000).toISOString() }
      : sydneyDayBounds(1);
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, student:students!inner(id, name), tutor_user_id, status')
      .eq('status', 'scheduled')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso);

    for (const s of (sessions ?? []) as any[]) {
      const studentId = s.student?.id;
      if (!studentId) continue;
      const { data: links } = await admin
        .from('parent_student_links')
        .select('id, parent:parents!inner(id, auth_user_id)')
        .eq('student_id', studentId)
        .is('revoked_at', null);
      let tutorName: string | null = null;
      if (s.tutor_user_id) {
        const { data: tp } = await admin
          .from('profiles').select('owner_name').eq('id', s.tutor_user_id).maybeSingle();
        tutorName = (tp?.owner_name as string | null) ?? null;
      }
      for (const l of (links ?? []) as any[]) {
        const uid = l.parent?.auth_user_id;
        const parentId = l.parent?.id;
        if (!uid || !parentId) continue;
        const result = await createNotification(admin, {
          userId: uid,
          type: 'session_reminder_24h',
          titleKey: 'session_reminder_24h.title',
          bodyKey: 'session_reminder_24h.body',
          templateVars: {
            student: s.student?.name ?? 'your child',
            time: formatTime(s.scheduled_at),
            duration: s.duration_minutes,
            subject_suffix: s.subject ? ` · ${s.subject}` : '',
          },
          linkUrl: `/parent/student/${studentId}`,
          context: { session_id: s.id, student_id: studentId },
          dedupeKey: `session_reminder_24h:${s.id}:${parentId}`,
          baseUrl,
        });
        if (result.ok) created++;
        else if (result.reason === 'dedupe') dupes++;
        else errors.push(`24h:${s.id}:${parentId}:${result.error ?? 'unknown'}`);
      }
    }
  } catch (e: any) {
    errors.push(`24h:scan:${e?.message ?? 'unknown'}`);
  }

  const completedAt = new Date().toISOString();
  console.info('[cron/session-reminders]', JSON.stringify({
    started_at: startedAt,
    completed_at: completedAt,
    notifications_created: created,
    skipped_dupes: dupes,
    errors: errors.length,
  }));

  return res.status(200).json({
    ok: true,
    started_at: startedAt,
    completed_at: completedAt,
    notifications_created: created,
    skipped_dupes: dupes,
    errors,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney',
  });
}
