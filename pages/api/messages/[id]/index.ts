import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { MAX_BODY_CHARS, previewOfBody } from '../../../../lib/messaging';

// PATCH /api/messages/[id]
// Body: { body?: string, delete?: true }
// Edits or soft-deletes a message within 5 minutes of send. Only the original
// sender (enforced server-side here AND by the RLS policy messages_update_own_recent).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const messageId = req.query.id as string;
  const body = (req.body ?? {}) as { body?: string; delete?: boolean };

  if (body.delete) {
    const { error } = await userClient
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_user_id', userId);
    if (error) return res.status(403).json({ error: 'Cannot edit this message (already past the edit window?)' });
    return res.status(200).json({ ok: true, deleted: true });
  }

  const newBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!newBody) return res.status(400).json({ error: 'body or delete flag required.' });
  if (newBody.length > MAX_BODY_CHARS) return res.status(400).json({ error: `Body exceeds ${MAX_BODY_CHARS} chars.` });

  const { data: updated, error } = await userClient
    .from('messages')
    .update({ body: newBody, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_user_id', userId)
    .select('id, thread_id')
    .maybeSingle();
  if (error || !updated) {
    // Most likely cause: the 5-minute window (enforced by RLS) has passed.
    return res.status(403).json({ error: 'Cannot edit this message (past the 5-minute window, or not yours).' });
  }

  // Refresh the thread preview if this edit changed the most recent message.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: latest } = await admin
        .from('messages')
        .select('id, body')
        .eq('thread_id', updated.thread_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.id === updated.id) {
        await admin
          .from('message_threads')
          .update({ last_message_preview: previewOfBody(newBody) })
          .eq('id', updated.thread_id);
      }
    } catch { /* non-fatal */ }
  }

  return res.status(200).json({ ok: true, id: updated.id, edited: true });
}
