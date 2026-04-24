import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '../../../../lib/notifications';

// POST /api/parent/homework/toggle
// Body: { session_id: UUID, completed: boolean }
// Parent marks homework done/undone for a linked student's session.
// Undo only allowed within 24 hours of the original mark.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  const parentAuthId = userData.user.id;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const completed = body.completed === true;
  if (!sessionId) return res.status(400).json({ error: 'session_id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: parent } = await admin
    .from('parents')
    .select('id, name, email')
    .eq('auth_user_id', parentAuthId)
    .maybeSingle();
  if (!parent) return res.status(403).json({ error: 'Parent account not found.' });

  const { data: session } = await admin
    .from('sessions')
    .select('id, student_id, tutor_user_id, homework_description, homework, homework_completed_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const { data: link } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', parent.id)
    .eq('student_id', session.student_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (!link) return res.status(403).json({ error: 'No access to this session.' });

  const homeworkText = ((session as any).homework_description || (session as any).homework || '').trim();
  if (!homeworkText) {
    return res.status(400).json({ error: 'This session has no homework to mark.' });
  }

  if (!completed) {
    // Undo: only allowed within 24h of the original mark.
    if (!session.homework_completed_at) {
      return res.status(400).json({ error: 'Homework is not marked complete.' });
    }
    const markedAt = new Date(session.homework_completed_at).getTime();
    if (Date.now() - markedAt > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'This was marked more than 24 hours ago and can no longer be undone.' });
    }
    const { error: undoErr } = await userClient
      .from('sessions')
      .update({
        homework_completed_at: null,
        homework_completed_by_user_id: null,
      })
      .eq('id', sessionId);
    if (undoErr) return res.status(500).json({ error: undoErr.message });
    return res.status(200).json({ ok: true, completed: false });
  }

  if (session.homework_completed_at) {
    return res.status(200).json({
      ok: true,
      completed: true,
      completedAt: session.homework_completed_at,
      already: true,
    });
  }

  const completedAt = new Date().toISOString();
  const { error: markErr } = await userClient
    .from('sessions')
    .update({
      homework_completed_at: completedAt,
      homework_completed_by_user_id: parentAuthId,
    })
    .eq('id', sessionId);
  if (markErr) return res.status(500).json({ error: markErr.message });

  // Notify the tutor.
  if (session.tutor_user_id) {
    try {
      const { data: student } = await admin
        .from('students').select('name').eq('id', session.student_id).maybeSingle();
      const studentName = (student?.name as string) ?? 'your student';
      const parentLabel = parent.name || parent.email || 'Parent';
      const snippet = homeworkText.length > 140 ? homeworkText.slice(0, 139) + '…' : homeworkText;
      await createNotification(admin, {
        userId: session.tutor_user_id,
        type: 'parent_update_posted',
        titleKey: 'parent_update_posted.homework_marked_title',
        bodyKey: 'parent_update_posted.homework_marked_body',
        templateVars: { parent: parentLabel, student: studentName, snippet },
        linkUrl: `/app/students/${session.student_id}`,
        context: { session_id: session.id },
        dedupeKey: `homework_completed:${session.id}`,
      });
    } catch (e) {
      console.error('[homework/toggle] notification failed', e);
    }
  }

  return res.status(200).json({ ok: true, completed: true, completedAt });
}
