import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import { logSessionChange } from '../../../lib/sessionChanges';
import { generateSessionsForTemplate, type SessionTemplate } from '../../../lib/sessionGeneration';

// POST /api/sessions/create
// Body: {
//   student_id: string,
//   subject?: string,
//   scheduled_at: string,        // ISO UTC
//   duration_minutes: number,
//   recurring?: {
//     recurrence_rule: 'weekly'|'fortnightly'|'monthly',
//     day_of_week: number,       // 0=Sun
//     start_time_local: string,  // HH:MM
//     timezone: string,          // Australia/Sydney
//     effective_from: string,    // YYYY-MM-DD
//     effective_until?: string   // YYYY-MM-DD (null = ongoing)
//   }
// }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const billing = await isOrgBillingOk(userClient, membership.organization_id);
  if (!billing.ok) return res.status(402).json({ error: 'subscription_required', reason: billing.reason });

  const body = (req.body ?? {}) as Record<string, any>;
  const studentId = String(body.student_id ?? '');
  const scheduledAt = String(body.scheduled_at ?? '');
  const duration = Number(body.duration_minutes);
  if (!studentId || !scheduledAt || !(duration > 0)) {
    return res.status(400).json({ error: 'student_id, scheduled_at, duration_minutes are required.' });
  }
  if (duration > 480) return res.status(400).json({ error: 'duration_minutes too large (max 480).' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Verify the student belongs to the caller's org. Also determine the tutor
  // to attribute: the caller if tutor, otherwise the student's primary tutor
  // or the caller (owner).
  const { data: student } = await admin
    .from('students')
    .select('id, primary_tutor_id, hourly_rate_cents, organization_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student || student.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  // Tutor attribution: if caller is a tutor, use self; else use student's
  // primary_tutor_id's auth_user_id (may be null); else caller.
  let tutorUserId = userId;
  if (membership.role === 'owner' && student.primary_tutor_id) {
    const { data: primaryTutor } = await admin
      .from('tutors').select('auth_user_id').eq('id', student.primary_tutor_id).maybeSingle();
    if (primaryTutor?.auth_user_id) tutorUserId = primaryTutor.auth_user_id;
  }

  // ------------------------------------------------------------------------
  // Recurring path: create a template, then backfill sessions.
  // ------------------------------------------------------------------------
  if (body.recurring) {
    const r = body.recurring as Record<string, any>;
    const rule = String(r.recurrence_rule ?? '');
    if (!['weekly', 'fortnightly', 'monthly'].includes(rule)) {
      return res.status(400).json({ error: 'Invalid recurrence_rule.' });
    }
    const dayOfWeek = Number(r.day_of_week);
    if (!(dayOfWeek >= 0 && dayOfWeek <= 6)) {
      return res.status(400).json({ error: 'Invalid day_of_week.' });
    }
    const startTimeLocal = String(r.start_time_local ?? '');
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTimeLocal)) {
      return res.status(400).json({ error: 'Invalid start_time_local (HH:MM).' });
    }
    const timezone = String(r.timezone ?? 'Australia/Sydney');
    const effectiveFrom = String(r.effective_from ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return res.status(400).json({ error: 'Invalid effective_from (YYYY-MM-DD).' });
    }
    const effectiveUntil = r.effective_until ? String(r.effective_until) : null;

    const { data: tpl, error: tplErr } = await admin
      .from('session_templates')
      .insert({
        organization_id: membership.organization_id,
        student_id: studentId,
        tutor_user_id: tutorUserId,
        created_by_user_id: userId,
        subject: body.subject ? String(body.subject) : null,
        duration_minutes: duration,
        recurrence_rule: rule,
        day_of_week: dayOfWeek,
        start_time_local: startTimeLocal.length === 5 ? `${startTimeLocal}:00` : startTimeLocal,
        timezone,
        effective_from: effectiveFrom,
        effective_until: effectiveUntil,
      })
      .select('*')
      .maybeSingle();
    if (tplErr || !tpl) {
      return res.status(500).json({ error: tplErr?.message ?? 'Could not create template.' });
    }

    const generated = await generateSessionsForTemplate(admin, tpl as SessionTemplate);
    return res.status(200).json({ ok: true, template_id: tpl.id, sessions_generated: generated });
  }

  // ------------------------------------------------------------------------
  // One-off session
  // ------------------------------------------------------------------------
  const { data: inserted, error: insertErr } = await admin
    .from('sessions')
    .insert({
      organization_id: membership.organization_id,
      owner_id: userId,
      student_id: studentId,
      tutor_user_id: tutorUserId,
      subject: body.subject ? String(body.subject) : null,
      topic: body.topic ? String(body.topic) : null,
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      charge_rate_cents: student.hourly_rate_cents ?? null,
      status: 'scheduled',
    })
    .select('id')
    .maybeSingle();
  if (insertErr || !inserted) {
    return res.status(500).json({ error: insertErr?.message ?? 'Could not create session.' });
  }

  await logSessionChange(admin, {
    sessionId: inserted.id,
    changedByUserId: userId,
    changeType: 'created',
    newStartTime: scheduledAt,
  });

  return res.status(200).json({ ok: true, session_id: inserted.id });
}
