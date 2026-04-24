import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveAssistantCaller, isAuthFailure } from '../../../lib/assistantHelpers';
import {
  runAssistantTurn,
  resolveOrgName,
  persistToolResult,
  DbMessageRow,
} from '../../../lib/assistantOrchestrator';
import {
  AnyPreview,
  ToolName,
  isKnownTool,
  isWriteTool,
  isHighRiskTool,
  isOwnerOnlyTool,
  LogSessionPreview,
  PolishNotesPreview,
  CreateStudentPreview,
  UpdateStudentPreview,
  ArchiveStudentPreview,
  CreateInvoicePreview,
  MarkInvoicePaidPreview,
  SendParentUpdatePreview,
  SendMessagePreview,
  MarkNotificationsReadPreview,
  AddStudentToHouseholdPreview,
  CreateTestAccountPreview,
  CreateBatchInvoicesPreview,
  AssignStudentToTutorPreview,
} from '../../../lib/assistantTools';
import { isOrgBillingOk } from '../../../lib/billing';
import { ToolCallerContext } from '../../../lib/assistantToolHandlers/shared';
import {
  executeLogSession,
  executePolishNotes,
  executeCreateStudent,
  executeUpdateStudent,
  executeArchiveStudent,
  executeCreateInvoice,
  executeMarkInvoicePaid,
  executeSendParentUpdate,
  executeSendMessage,
  executeMarkNotificationsRead,
  executeAddStudentToHousehold,
  executeCreateTestAccount,
  executeCreateBatchInvoices,
  executeAssignStudentToTutor,
  ExecuteResult,
} from '../../../lib/assistantToolHandlers/executors';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'Assistant is not configured.' });

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
    tool_use_id?: string;
    tool_name?: string;
    preview?: AnyPreview;
    user_typed_confirmation?: boolean;
  };
  const {
    conversation_id: conversationId,
    tool_use_id: toolUseId,
    tool_name: toolName,
    preview,
    user_typed_confirmation: typedConfirmation,
  } = body;

  if (!conversationId || !toolUseId || !toolName || !preview) {
    return res.status(400).json({ error: 'conversation_id, tool_use_id, tool_name, and preview are required.' });
  }
  if (!isKnownTool(toolName) || !isWriteTool(toolName)) {
    return res.status(400).json({ error: `Tool "${toolName}" is not an executable write tool.` });
  }
  if (preview.tool_name !== toolName) {
    return res.status(400).json({ error: 'preview.tool_name does not match tool_name.' });
  }

  // OWNER-ONLY server-side check.
  if (isOwnerOnlyTool(toolName) && membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the organisation owner can do this.' });
  }

  // HIGH-RISK typed-confirm server-side enforcement.
  // This is enforced from tool_name — not from a client-supplied flag — so a
  // crafted request can't bypass the UI check by sending requires_typed=false.
  if (isHighRiskTool(toolName) && typedConfirmation !== true) {
    return res.status(400).json({
      error: 'typed_confirmation_required',
      message: "This action requires you to type 'confirm' before executing.",
    });
  }

  // Verify caller owns the conversation.
  const { data: convo } = await userClient
    .from('assistant_conversations')
    .select('id, organization_id')
    .eq('id', conversationId)
    .eq('user_id', membership.user_id)
    .maybeSingle();
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

  const collected: DbMessageRow[] = [];
  const callerCtx: ToolCallerContext = { client: userClient, membership };

  let result: ExecuteResult;
  try {
    result = await dispatchExecute(
      callerCtx,
      toolName as ToolName,
      preview,
      { host: (req.headers.host as string) ?? null, callerEmail: userEmail ?? null },
    );
  } catch (e: any) {
    console.error('[assistant/execute] dispatch threw:', e);
    result = { ok: false, error: 'Execution failed.' };
  }

  const payload: Record<string, unknown> = result.ok
    ? {
        ok: true,
        summary: result.summary,
        session_id: result.session_id,
        invoice_id: result.invoice_id,
        student_id: result.student_id,
        parent_update_id: result.parent_update_id,
        already_done: result.already_done,
      }
    : { ok: false, error: result.error };

  const toolResultRow = await persistToolResult(userClient, {
    conversation_id: conversationId,
    organization_id: membership.organization_id,
    user_id: membership.user_id,
    tool_use_id: toolUseId,
    payload,
  });
  collected.push(toolResultRow);

  if (!result.ok) {
    return res.status(200).json({
      ok: false,
      error: result.error,
      new_messages: collected,
    });
  }

  // Ask Claude for a one-sentence wrap-up.
  const orgName = await resolveOrgName(userClient, membership.organization_id);
  const turn = await runAssistantTurn({
    userClient,
    membership,
    userEmail,
    conversationId,
    anthropicKey,
    orgName,
  });

  return res.status(200).json({
    ok: true,
    summary: result.summary,
    session_id: result.session_id,
    invoice_id: result.invoice_id,
    student_id: result.student_id,
    parent_update_id: result.parent_update_id,
    already_done: result.already_done,
    new_messages: [...collected, ...turn.new_messages],
    pending: turn.pending,
  });
}

async function dispatchExecute(
  ctx: ToolCallerContext,
  name: ToolName,
  preview: AnyPreview,
  req: { host: string | null; callerEmail: string | null },
): Promise<ExecuteResult> {
  switch (name) {
    case 'log_session':
      return executeLogSession(ctx, preview as LogSessionPreview);
    case 'polish_notes':
      return executePolishNotes(ctx, preview as PolishNotesPreview);
    case 'create_student':
      return executeCreateStudent(ctx, preview as CreateStudentPreview, req);
    case 'update_student':
      return executeUpdateStudent(ctx, preview as UpdateStudentPreview);
    case 'archive_student':
      return executeArchiveStudent(ctx, preview as ArchiveStudentPreview);
    case 'create_invoice':
      return executeCreateInvoice(ctx, preview as CreateInvoicePreview);
    case 'mark_invoice_paid':
      return executeMarkInvoicePaid(ctx, preview as MarkInvoicePaidPreview);
    case 'send_parent_update':
      return executeSendParentUpdate(ctx, preview as SendParentUpdatePreview);
    case 'send_message':
      return executeSendMessage(ctx, preview as SendMessagePreview, req);
    case 'mark_notifications_read':
      return executeMarkNotificationsRead(ctx, preview as MarkNotificationsReadPreview);
    case 'add_student_to_household':
      return executeAddStudentToHousehold(ctx, preview as AddStudentToHouseholdPreview);
    case 'create_batch_invoices':
      return executeCreateBatchInvoices(ctx, preview as CreateBatchInvoicesPreview, req);
    case 'create_test_account':
      return executeCreateTestAccount(ctx, preview as CreateTestAccountPreview, req);
    case 'assign_student_to_tutor':
      return executeAssignStudentToTutor(ctx, preview as AssignStudentToTutorPreview);
    default:
      return { ok: false, error: `Unknown write tool: ${name}` };
  }
}
