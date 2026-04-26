import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import {
  generateSessionsForTemplate,
  type SessionTemplate,
} from '../../../lib/sessionGeneration';

// GET  /api/session-templates           list active templates for the caller's org
// POST /api/session-templates           create a template + generate next 8 weeks
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

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (req.method === 'GET') {
    let q = admin
      .from('session_templates')
      .select(`
        id, organization_id, student_id, tutor_user_id, created_by_user_id,
        subject, duration_minutes, recurrence_rule, day_of_week, start_time_local,
        timezone, effective_from, effective_until, cancelled_at, notes_template,
        generated_through_date, created_at,
        student:students!inner(id, name)
      `)
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false });
    if (membership.role === 'tutor') q = q.eq('tutor_user_id', userId);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ templates: data ?? [] });
  }

  if (req.method === 'POST') {
    const billing = await isOrgBillingOk(userClient, membership.organization_id);
    if (!billing.ok) return res.status(402).json({ error: 'subscription_required', reason: billing.reason });

    const body = (req.body ?? {}) as Record<string, any>;
    const studentId = String(body.student_id ?? '');
    const subject = body.subject ? String(body.subject) : null;
    const duration = Number(body.duration_minutes);
    const rule = String(body.recurrence_rule ?? '');
    const dayOfWeek = Number(body.day_of_week);
    const startTime = String(body.start_time_local ?? '');
    const timezone = String(body.timezone ?? 'Australia/Sydney');
    const effectiveFrom = String(body.effective_from ?? '');
    const notesTemplate = body.notes_template ? String(body.notes_template) : null;

    if (!studentId) return res.status(400).json({ error: 'student_id is required.' });
    if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
      return res.status(400).json({ error: 'duration_minutes must be 15-480.' });
    }
    if (!['weekly', 'fortnightly', 'monthly'].includes(rule)) {
      return res.status(400).json({ error: 'Invalid recurrence_rule.' });
    }
    if (!(dayOfWeek >= 0 && dayOfWeek <= 6)) {
      return res.status(400).json({ error: 'day_of_week must be 0-6.' });
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
      return res.status(400).json({ error: 'Invalid start_time_local (HH:MM).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return res.status(400).json({ error: 'Invalid effective_from (YYYY-MM-DD).' });
    }

    // Verify student belongs to org and resolve tutor attribution.
    const { data: student } = await admin
      .from('students')
      .select('id, primary_tutor_id, organization_id')
      .eq('id', studentId)
      .maybeSingle();
    if (!student || student.organization_id !== membership.organization_id) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    let tutorUserId = userId;
    if (membership.role === 'owner' && student.primary_tutor_id) {
      const { data: t } = await admin
        .from('tutors').select('auth_user_id').eq('id', student.primary_tutor_id).maybeSingle();
      if (t?.auth_user_id) tutorUserId = t.auth_user_id;
    }

    const { data: tpl, error: insertErr } = await admin
      .from('session_templates')
      .insert({
        organization_id: membership.organization_id,
        student_id: studentId,
        tutor_user_id: tutorUserId,
        created_by_user_id: userId,
        subject,
        duration_minutes: duration,
        recurrence_rule: rule,
        day_of_week: dayOfWeek,
        start_time_local: startTime.length === 5 ? `${startTime}:00` : startTime,
        timezone,
        effective_from: effectiveFrom,
        notes_template: notesTemplate,
      })
      .select('*')
      .maybeSingle();
    if (insertErr || !tpl) {
      return res.status(500).json({ error: insertErr?.message ?? 'Could not create template.' });
    }

    // Generate next 8 weeks immediately.
    const generated = await generateSessionsForTemplate(admin, tpl as SessionTemplate, { horizonDays: 56 });
    return res.status(200).json({ ok: true, template: tpl, sessions_generated: generated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
