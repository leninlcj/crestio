import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveAssistantCaller, isAuthFailure } from '../../../../../lib/assistantHelpers';

const MESSAGES_LIMIT = 200;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await resolveAssistantCaller(req);
  if (isAuthFailure(ctx)) return res.status(ctx.status).json({ error: ctx.error });
  const { userClient, userId } = ctx;

  const id = req.query.id;
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Missing id.' });

  // Verify caller owns the conversation (RLS would enforce, but explicit 404 is cleaner).
  const { data: convo } = await userClient
    .from('assistant_conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

  const { data, error } = await userClient
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(MESSAGES_LIMIT);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: data ?? [] });
}
