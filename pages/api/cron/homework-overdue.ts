import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '../../../lib/notifications';
import { getBaseUrl } from '../../../lib/stripe';

// Vercel Cron → daily at 09:00 UTC.
// One notification per parent per day per overdue homework, for homework that
// is 2–14 days past the due date and still unmarked.
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
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let dupes = 0;
  const errors: string[] = [];

  try {
    const nowMs = Date.now();
    const cutoffNew = new Date(nowMs - 2 * 86_400_000).toISOString().slice(0, 10);
    const cutoffOld = new Date(nowMs - 14 * 86_400_000).toISOString().slice(0, 10);

    const { data: sessions } = await admin
      .from('sessions')
      .select('id, student_id, homework_description, homework, homework_due_date, student:students!inner(id, name)')
      .not('homework_description', 'is', null)
      .is('homework_completed_at', null)
      .lt('homework_due_date', cutoffNew)
      .gt('homework_due_date', cutoffOld);

    for (const s of (sessions ?? []) as any[]) {
      const homeworkText = (s.homework_description || s.homework || '').trim();
      if (!homeworkText) continue;
      const studentName = s.student?.name ?? 'your child';
      const studentId = s.student_id;

      const { data: links } = await admin
        .from('parent_student_links')
        .select('parent:parents!inner(auth_user_id)')
        .eq('student_id', studentId)
        .is('revoked_at', null);
      const parentUserIds = ((links ?? []) as any[])
        .map((l) => l.parent?.auth_user_id)
        .filter(Boolean) as string[];

      const snippet = homeworkText.length > 140 ? homeworkText.slice(0, 139) + '…' : homeworkText;
      const dueLabel = s.homework_due_date
        ? new Date(s.homework_due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        : 'recently';

      for (const uid of parentUserIds) {
        const result = await createNotification(admin, {
          userId: uid,
          type: 'parent_update_posted',
          title: `${studentName}'s homework is overdue`,
          body: `${snippet}\n\nWas due ${dueLabel}. Mark it complete in the portal when done.`,
          linkUrl: `/parent/student/${studentId}?tab=homework`,
          context: { session_id: s.id, student_id: studentId },
          dedupeKey: `homework_overdue:${s.id}:${uid}:${today}`,
          baseUrl,
        });
        if (result.ok) created++;
        else if (result.reason === 'dedupe') dupes++;
        else errors.push(`${s.id}:${uid}:${result.error ?? 'unknown'}`);
      }
    }
  } catch (e: any) {
    errors.push(`scan:${e?.message ?? 'unknown'}`);
  }

  const completedAt = new Date().toISOString();
  console.info('[cron/homework-overdue]', JSON.stringify({
    started_at: startedAt, completed_at: completedAt,
    notifications_created: created, skipped_dupes: dupes, errors: errors.length,
  }));
  return res.status(200).json({
    ok: true, started_at: startedAt, completed_at: completedAt,
    notifications_created: created, skipped_dupes: dupes, errors,
  });
}
