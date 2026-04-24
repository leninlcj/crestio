import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveAssistantCaller, isAuthFailure } from '../../../../lib/assistantHelpers';

const MAX_TITLE_LEN = 80;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveAssistantCaller(req);
  if (isAuthFailure(ctx)) return res.status(ctx.status).json({ error: ctx.error });
  const { userClient, userId } = ctx;

  const id = req.query.id;
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Missing id.' });

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as { title?: string };
    const trimmed = (body.title ?? '').trim();
    if (!trimmed) return res.status(400).json({ error: 'Title is required.' });
    const title = trimmed.slice(0, MAX_TITLE_LEN);

    const { data, error } = await userClient
      .from('assistant_conversations')
      .update({ title })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, title, created_at, last_message_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Conversation not found.' });
    return res.status(200).json({ conversation: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await userClient
      .from('assistant_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
