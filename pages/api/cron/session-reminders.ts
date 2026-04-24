import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '../../../lib/notifications';
import { formatAuDateTime } from '../../../lib/sessionChanges';
import { getBaseUrl } from '../../../lib/stripe';

// Vercel Cron → every 15 minutes.
// Finds sessions ~1 hour out (tutor reminder) and ~24 hours out (parent
// reminder). Dedupe via notification_dispatch_log so re-runs / overlap
// windows don't double-fire.
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

  // ------ 1-hour tutor reminder window (45-75 min ahead) -----------------
  try {
    const nowMs = Date.now();
    const fromIso = new Date(nowMs + 45 * 60_000).toISOString();
    const toIso = new Date(nowMs + 75 * 60_000).toISOString();
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
        title: `Session in about 1 hour: ${s.student?.name ?? 'student'}`,
        body: [
          s.subject,
          `${s.duration_minutes} min`,
          formatAuDateTime(s.scheduled_at),
        ].filter(Boolean).join(' · '),
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

  // ------ 24-hour parent reminder window (23h45–24h15 ahead) -------------
  try {
    const nowMs = Date.now();
    const fromIso = new Date(nowMs + (23 * 60 + 45) * 60_000).toISOString();
    const toIso   = new Date(nowMs + (24 * 60 + 15) * 60_000).toISOString();
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
          title: `Reminder: ${s.student?.name ?? 'your child'}'s session tomorrow at ${formatTime(s.scheduled_at)}`,
          body: [
            s.subject,
            `${s.duration_minutes} min`,
            tutorName ? `with ${tutorName}` : null,
          ].filter(Boolean).join(' · '),
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
