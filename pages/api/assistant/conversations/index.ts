import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveAssistantCaller, isAuthFailure } from '../../../../lib/assistantHelpers';

const MAX_TITLE_LEN = 80;
const LIST_LIMIT = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveAssistantCaller(req);
  if (isAuthFailure(ctx)) return res.status(ctx.status).json({ error: ctx.error });
  const { userClient, userId, membership } = ctx;

  if (req.method === 'GET') {
    const { data: rows, error } = await userClient
      .from('assistant_conversations')
      .select('id, title, created_at, last_message_at')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) return res.status(500).json({ error: error.message });

    const ids = (rows ?? []).map((r) => r.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: msgRows } = await userClient
        .from('assistant_messages')
        .select('conversation_id')
        .in('conversation_id', ids);
      for (const m of msgRows ?? []) {
        counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1;
      }
    }
    const conversations = (rows ?? []).map((r) => ({
      ...r,
      message_count: counts[r.id] ?? 0,
    }));
    return res.status(200).json({ conversations });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { title?: string };
    const trimmed = (body.title ?? '').trim();
    const title = trimmed.length > 0 ? trimmed.slice(0, MAX_TITLE_LEN) : 'New conversation';

    const { data, error } = await userClient
      .from('assistant_conversations')
      .insert({
        organization_id: membership.organization_id,
        user_id: userId,
        title,
      })
      .select('id, title, created_at, last_message_at')
      .maybeSingle();
    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Create failed.' });
    return res.status(200).json({ conversation: { ...data, message_count: 0 } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
