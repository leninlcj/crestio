import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';
import { sendEmail } from '../../../../lib/email';
import { buildSessionPolishUpdateEmail } from '../../../../lib/emails/sessionPolishUpdate';
import { getBaseUrl } from '../../../../lib/stripe';
import { processVoiceSample } from '../../../../lib/voice/sample';

// POST   /api/sessions/[id]/send-polish-to-parent
//   Body: { content: string, save_as_official?: boolean }
//   Sends the email, sets parent_notified_at, returns { ok, parent_email }.
//
// DELETE /api/sessions/[id]/send-polish-to-parent
//   Clears parent_notified_at — used by the undo / "mark as not sent" flow.
//   Email cannot be unsent, but the audit flag can.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const sessionId = String(req.query.id ?? '');
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Load session + student. RLS would also catch wrong-org access via
  // userClient, but we do the explicit check so we can return clean errors.
  const { data: session } = await admin
    .from('sessions')
    .select('id, organization_id, student_id, tutor_user_id, scheduled_at, subject, notes_parent_facing, parent_notified_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.organization_id !== membership.organization_id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (membership.role === 'tutor' && session.tutor_user_id !== userId) {
    return res.status(403).json({ error: 'You can only send updates for your own sessions.' });
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('sessions').update({ parent_notified_at: null }).eq('id', sessionId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, cleared: true });
  }

  // POST path
  const body = (req.body ?? {}) as Record<string, any>;
  const content = (body.content ?? '').toString().trim();
  const saveAsOfficial = body.save_as_official === true;
  if (!content) return res.status(400).json({ error: 'content is required.' });
  if (content.length > 5000) return res.status(400).json({ error: 'content too long (max 5000).' });

  const { data: student } = await admin
    .from('students')
    .select('id, name, parent_name, parent_email')
    .eq('id', session.student_id)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  // Prefer the linked parent (portal-verified email) over the static
  // parent_email column on students.
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  let parentPortalUrl: string | null = null;

  const { data: links } = await admin
    .from('parent_student_links')
    .select('parent:parents!inner(id, email, name)')
    .eq('student_id', student.id)
    .is('revoked_at', null)
    .limit(1);
  const linkedParent = ((links ?? []) as any[])[0]?.parent ?? null;
  if (linkedParent?.email) {
    recipientEmail = linkedParent.email;
    recipientName = linkedParent.name ?? null;
    parentPortalUrl = `${getBaseUrl(req)}/parent/student/${student.id}`;
  } else if (student.parent_email) {
    recipientEmail = student.parent_email;
    recipientName = student.parent_name ?? null;
  }

  if (!recipientEmail) {
    return res.status(400).json({ error: 'No parent email on file. Add one to the student record first.' });
  }

  // Tutor profile for from name + reply-to + practice name.
  const { data: tutorProfile } = await admin
    .from('profiles')
    .select('owner_name, business_name, email')
    .eq('id', userId)
    .maybeSingle();
  const tutorName = (tutorProfile?.owner_name as string | null) ?? 'Your tutor';
  const practiceName = (tutorProfile?.business_name as string | null) ?? 'Crestio';
  const replyTo = (tutorProfile?.email as string | null) ?? undefined;

  const studentFirstName = (student.name ?? 'your child').split(/\s+/)[0] ?? 'your child';
  const sessionDateLabel = formatAuDate(session.scheduled_at);

  const built = buildSessionPolishUpdateEmail({
    parentName: recipientName,
    studentFirstName,
    tutorName,
    practiceName,
    sessionDateLabel,
    subject: session.subject,
    polishedContent: content,
    parentPortalUrl,
  });

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject: built.subject,
    html: built.html,
    text: built.text,
    replyTo,
  });
  if (!sendResult.success) {
    return res.status(502).json({ error: sendResult.error ?? 'Could not send email.' });
  }

  const update: Record<string, any> = { parent_notified_at: new Date().toISOString() };
  if (saveAsOfficial) update.notes_parent_facing = content;

  const { error: updateErr } = await admin
    .from('sessions').update(update).eq('id', sessionId);
  if (updateErr) {
    console.error('[send-polish-to-parent] flag update failed (email did send)', updateErr);
  }

  // 14G voice learning: compare what we sent against the most recent AI
  // polish for this session. If they differ (or even if they match — accepted
  // as-is is still signal), capture a tutor_voice_samples row. Wrapped so a
  // failure here never breaks the user's send flow.
  try {
    const { data: lastPolish } = await admin
      .from('notes_polish_log')
      .select('polished_text')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .not('polished_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const aiPolish = (lastPolish as any)?.polished_text;
    if (typeof aiPolish === 'string' && aiPolish.trim()) {
      await processVoiceSample({
        userId,
        organizationId: membership.organization_id,
        sessionId,
        beforeText: aiPolish,
        afterText: content,
        accepted: true,
        userClient,
        admin,
      });
    }
  } catch (err) {
    console.error('[send-polish-to-parent] voice sample capture failed (non-fatal)', err);
  }

  return res.status(200).json({
    ok: true,
    parent_email: recipientEmail,
    parent_name: recipientName,
  });
}

function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
