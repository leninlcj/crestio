import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveAssistantCaller, isAuthFailure } from '../../../lib/assistantHelpers';
import {
  runAssistantTurn,
  resolveOrgName,
  persistUserText,
  persistToolResult,
  DbMessageRow,
} from '../../../lib/assistantOrchestrator';
import { isOrgBillingOk } from '../../../lib/billing';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Assistant is not configured. Ask an admin to set ANTHROPIC_API_KEY.' });
  }

  const ctx = await resolveAssistantCaller(req);
  if (isAuthFailure(ctx)) return res.status(ctx.status).json({ error: ctx.error });
  const { userClient, membership, userEmail } = ctx;

  const billing = await isOrgBillingOk(userClient, membership.organization_id);
  if (!billing.ok) {
    return res.status(402).json({
      error: 'subscription_required',
      reason: billing.reason,
      checkout_url_hint: '/app/settings?tab=billing',
    });
  }

  const rl = checkRateLimit({
    key: `assistant:${membership.user_id}`,
    limit: LIMITS.assistant.limit,
    windowMs: LIMITS.assistant.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({
      error: 'rate_limit',
      retry_after_seconds: rl.retry_after_seconds,
    });
  }

  const body = (req.body ?? {}) as {
    conversation_id?: string;
    message?: string;
    cancel_tool_use_id?: string;
  };

  const conversationId = body.conversation_id;
  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ error: 'conversation_id is required.' });
  }

  // Verify caller owns the conversation.
  const { data: convo } = await userClient
    .from('assistant_conversations')
    .select('id, organization_id')
    .eq('id', conversationId)
    .eq('user_id', membership.user_id)
    .maybeSingle();
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  if (convo.organization_id !== membership.organization_id) {
    return res.status(403).json({ error: 'Conversation belongs to a different organization.' });
  }

  const orgName = await resolveOrgName(userClient, membership.organization_id);
  const collected: DbMessageRow[] = [];

  if (body.cancel_tool_use_id) {
    // Persist a cancellation tool_result and let Claude comment.
    const row = await persistToolResult(userClient, {
      conversation_id: conversationId,
      organization_id: membership.organization_id,
      user_id: membership.user_id,
      tool_use_id: body.cancel_tool_use_id,
      payload: { cancelled: true, ok: false },
    });
    collected.push(row);
  } else if (typeof body.message === 'string' && body.message.trim()) {
    const row = await persistUserText(userClient, {
      conversation_id: conversationId,
      organization_id: membership.organization_id,
      user_id: membership.user_id,
      text: body.message.trim(),
    });
    collected.push(row);
  } else {
    return res.status(400).json({ error: 'Either message or cancel_tool_use_id is required.' });
  }

  const turn = await runAssistantTurn({
    userClient,
    membership,
    userEmail,
    conversationId,
    anthropicKey,
    orgName,
  });

  return res.status(200).json({
    new_messages: [...collected, ...turn.new_messages],
    pending: turn.pending,
    text: turn.text,
    error: turn.error,
  });
}
