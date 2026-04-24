import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TOOLS,
  AnyPreview,
  ToolName,
  isReadTool,
  isWriteTool,
  isHighRiskTool,
  isOwnerOnlyTool,
  isKnownTool,
  LogSessionInput,
  PolishNotesInput,
  CreateStudentInput,
  UpdateStudentInput,
  ArchiveStudentInput,
  CreateInvoiceInput,
  MarkInvoicePaidInput,
  SendParentUpdateInput,
  AssignStudentToTutorInput,
  SendMessageInput,
  GetUpcomingSessionsInput,
  GetRecentSessionsInput,
  GetStudentSummaryInput,
  GetUnpaidInvoicesInput,
  GetEarningsSummaryInput,
  SearchStudentsInput,
  GetRecentMessagesInput,
  GetRecentNotificationsInput,
  MarkNotificationsReadInput,
  GetStudentHomeworkStatusInput,
  ListPendingHomeworkInput,
  GetHouseholdInput,
  ListHouseholdsInput,
  FindHouseholdByNameInput,
  AddStudentToHouseholdInput,
  CreateTestAccountInput,
  GetUnbilledSummaryInput,
  CreateBatchInvoicesInput,
  OWNER_ONLY_EMAIL_TOOL_NAMES,
} from './assistantTools';
import { isPlatformOwner } from './owner';
import { buildAssistantSystemPrompt } from './assistantSystemPrompt';
import { Membership } from './membership';
import {
  handleGetUpcomingSessions,
  handleGetRecentSessions,
  handleGetStudentSummary,
  handleGetUnpaidInvoices,
  handleGetEarningsSummary,
  handleSearchStudents,
  handleGetRecentMessages,
  handleGetRecentNotifications,
  handleGetStudentHomeworkStatus,
  handleListPendingHomework,
  handleGetHousehold,
  handleListHouseholds,
  handleFindHouseholdByName,
  handleGetUnbilledSummary,
} from './assistantToolHandlers/readers';
import {
  previewLogSession,
  previewPolishNotes,
  previewCreateStudent,
  previewUpdateStudent,
  previewArchiveStudent,
  previewCreateInvoice,
  previewMarkInvoicePaid,
  previewSendParentUpdate,
  previewSendMessage,
  previewMarkNotificationsRead,
  previewAssignStudentToTutor,
  previewAddStudentToHousehold,
  previewCreateTestAccount,
  previewCreateBatchInvoices,
} from './assistantToolHandlers/previews';
import { ToolCallerContext } from './assistantToolHandlers/shared';

type AnthropicMessage = Anthropic.Messages.MessageParam;

export type DbMessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: any;
  created_at: string;
};

export type RunAssistantTurnResult = {
  new_messages: DbMessageRow[];
  pending?: {
    tool_use_id: string;
    tool_name: ToolName;
    input: unknown;
    preview: AnyPreview;
    requires_typed_confirmation: boolean;
  };
  text?: string;
  error?: string;
};

const MAX_HISTORY_MESSAGES = 40;
const MAX_LOOP_ITERATIONS = 6;

// Rehydrate DB rows into the turn-based format Anthropic's API expects.
export function rehydrateForClaude(rows: DbMessageRow[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.role === 'user') {
      out.push({ role: 'user', content: row.content?.text ?? '' });
      i++;
    } else if (row.role === 'assistant') {
      const blocks: any[] = [];
      const text: string = row.content?.text ?? '';
      if (text) blocks.push({ type: 'text', text });
      if (rows[i + 1]?.role === 'tool_use') {
        const tu = rows[i + 1];
        blocks.push({
          type: 'tool_use',
          id: tu.content?.tool_use_id,
          name: tu.content?.tool_name,
          input: tu.content?.tool_input ?? {},
        });
        i += 2;
      } else {
        i++;
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
    } else if (row.role === 'tool_use') {
      out.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: row.content?.tool_use_id,
            name: row.content?.tool_name,
            input: row.content?.tool_input ?? {},
          },
        ],
      });
      i++;
    } else if (row.role === 'tool_result') {
      const c = row.content ?? {};
      let content: string;
      if (c.cancelled) {
        content = 'User declined to run this action.';
      } else if (c.error) {
        content = `Error: ${c.error}`;
      } else if (c.read_result) {
        // Read-tool result — hand Claude the structured data verbatim.
        content = JSON.stringify(c.read_result).slice(0, 8000);
      } else {
        content = JSON.stringify({
          ok: c.ok !== false,
          summary: c.summary,
          session_id: c.session_id,
          invoice_id: c.invoice_id,
          student_id: c.student_id,
          parent_update_id: c.parent_update_id,
          already_done: c.already_done,
        });
      }
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: c.tool_use_id,
            content,
            is_error: !!c.error || c.ok === false,
          },
        ],
      });
      i++;
    } else {
      i++;
    }
  }
  return out;
}

async function loadHistory(
  client: SupabaseClient,
  conversationId: string,
): Promise<DbMessageRow[]> {
  const { data, error } = await client
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);
  if (error) throw new Error(error.message);
  return (data ?? []) as DbMessageRow[];
}

async function insertRow(
  client: SupabaseClient,
  row: {
    conversation_id: string;
    organization_id: string;
    user_id: string;
    role: DbMessageRow['role'];
    content: any;
  },
): Promise<DbMessageRow> {
  const { data, error } = await client
    .from('assistant_messages')
    .insert(row)
    .select('id, role, content, created_at')
    .maybeSingle();
  if (error || !data) {
    throw new Error(error?.message ?? 'Insert failed.');
  }
  return data as DbMessageRow;
}

export async function runAssistantTurn(args: {
  userClient: SupabaseClient;
  membership: Membership;
  userEmail: string;
  conversationId: string;
  anthropicKey: string;
  orgName: string;
}): Promise<RunAssistantTurnResult> {
  const { userClient, membership, userEmail, conversationId, anthropicKey, orgName } = args;

  const { data: callerProfile } = await userClient
    .from('profiles').select('locale').eq('id', membership.user_id).maybeSingle();
  const callerLocale = callerProfile?.locale && typeof callerProfile.locale === 'string' ? callerProfile.locale : 'en';

  const systemPrompt = buildAssistantSystemPrompt({
    role: membership.role,
    organizationName: orgName,
    userEmail,
    todayISO: new Date().toISOString().slice(0, 10),
    userLocale: callerLocale,
  });

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const collected: DbMessageRow[] = [];
  const ctx: ToolCallerContext = { client: userClient, membership };

  // Hide owner-only-by-email tools from non-owners — they don't even see the
  // tool exists. Server-side check on execute() still enforces it either way.
  const isOwnerCaller = isPlatformOwner(userEmail);
  const effectiveTools = isOwnerCaller
    ? TOOLS
    : TOOLS.filter((t: any) => !(OWNER_ONLY_EMAIL_TOOL_NAMES as readonly string[]).includes(t.name));

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    const history = await loadHistory(userClient, conversationId);
    const messages = rehydrateForClaude(history);

    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: effectiveTools as any,
        messages,
      });
    } catch (e: any) {
      console.error('[assistant] Anthropic call failed:', e);
      return { new_messages: collected, error: 'Assistant is unavailable right now. Try again in a moment.' };
    }

    const contentBlocks = response.content as any[];
    const textBlocks = contentBlocks.filter((b) => b.type === 'text');
    const toolUseBlock = contentBlocks.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | undefined;
    const assistantText = textBlocks.map((b) => b.text).join('\n').trim();

    if (assistantText) {
      const inserted = await insertRow(userClient, {
        conversation_id: conversationId,
        organization_id: membership.organization_id,
        user_id: membership.user_id,
        role: 'assistant',
        content: { text: assistantText },
      });
      collected.push(inserted);
    }

    if (response.stop_reason !== 'tool_use' || !toolUseBlock) {
      return { new_messages: collected, text: assistantText };
    }

    // Persist the tool_use intent.
    const toolUseRow = await insertRow(userClient, {
      conversation_id: conversationId,
      organization_id: membership.organization_id,
      user_id: membership.user_id,
      role: 'tool_use',
      content: {
        tool_use_id: toolUseBlock.id,
        tool_name: toolUseBlock.name,
        tool_input: toolUseBlock.input,
      },
    });
    collected.push(toolUseRow);

    if (!isKnownTool(toolUseBlock.name)) {
      const fail = await insertRow(userClient, {
        conversation_id: conversationId,
        organization_id: membership.organization_id,
        user_id: membership.user_id,
        role: 'tool_result',
        content: { tool_use_id: toolUseBlock.id, ok: false, error: `Tool "${toolUseBlock.name}" is not available.` },
      });
      collected.push(fail);
      continue;
    }

    // Owner-only guard.
    if (isOwnerOnlyTool(toolUseBlock.name) && membership.role !== 'owner') {
      const fail = await insertRow(userClient, {
        conversation_id: conversationId,
        organization_id: membership.organization_id,
        user_id: membership.user_id,
        role: 'tool_result',
        content: {
          tool_use_id: toolUseBlock.id,
          ok: false,
          error: 'Only the organisation owner can do this.',
        },
      });
      collected.push(fail);
      continue;
    }

    // READ tools: handle inline, loop so Claude can narrate the result.
    if (isReadTool(toolUseBlock.name)) {
      const readResult = await runReadTool(ctx, toolUseBlock.name as ToolName, toolUseBlock.input);
      const row = await insertRow(userClient, {
        conversation_id: conversationId,
        organization_id: membership.organization_id,
        user_id: membership.user_id,
        role: 'tool_result',
        content: {
          tool_use_id: toolUseBlock.id,
          ok: true,
          read_result: readResult,
        },
      });
      collected.push(row);
      continue;
    }

    // WRITE tools: build a preview and surface to the client.
    if (isWriteTool(toolUseBlock.name)) {
      const previewResult = await runWritePreview(
        ctx,
        toolUseBlock.name as ToolName,
        toolUseBlock.input,
        anthropicKey,
      );

      if (previewResult.kind === 'failure') {
        const fail = await insertRow(userClient, {
          conversation_id: conversationId,
          organization_id: membership.organization_id,
          user_id: membership.user_id,
          role: 'tool_result',
          content: { tool_use_id: toolUseBlock.id, ok: false, error: previewResult.message },
        });
        collected.push(fail);
        continue;
      }

      return {
        new_messages: collected,
        pending: {
          tool_use_id: toolUseBlock.id,
          tool_name: toolUseBlock.name as ToolName,
          input: toolUseBlock.input,
          preview: previewResult.preview,
          requires_typed_confirmation: isHighRiskTool(toolUseBlock.name),
        },
      };
    }
  }

  return { new_messages: collected, text: "I'm having trouble completing that. Try rephrasing?" };
}

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

async function runReadTool(ctx: ToolCallerContext, name: ToolName, input: unknown): Promise<any> {
  try {
    switch (name) {
      case 'get_upcoming_sessions':
        return await handleGetUpcomingSessions(ctx, input as GetUpcomingSessionsInput);
      case 'get_recent_sessions':
        return await handleGetRecentSessions(ctx, input as GetRecentSessionsInput);
      case 'get_student_summary':
        return await handleGetStudentSummary(ctx, input as GetStudentSummaryInput);
      case 'get_unpaid_invoices':
        return await handleGetUnpaidInvoices(ctx, input as GetUnpaidInvoicesInput);
      case 'get_earnings_summary':
        return await handleGetEarningsSummary(ctx, input as GetEarningsSummaryInput);
      case 'search_students':
        return await handleSearchStudents(ctx, input as SearchStudentsInput);
      case 'get_recent_messages':
        return await handleGetRecentMessages(ctx, input as GetRecentMessagesInput);
      case 'get_recent_notifications':
        return await handleGetRecentNotifications(ctx, input as GetRecentNotificationsInput);
      case 'get_student_homework_status':
        return await handleGetStudentHomeworkStatus(ctx, input as GetStudentHomeworkStatusInput);
      case 'list_pending_homework':
        return await handleListPendingHomework(ctx, input as ListPendingHomeworkInput);
      case 'get_household':
        return await handleGetHousehold(ctx, input as GetHouseholdInput);
      case 'list_households':
        return await handleListHouseholds(ctx, input as ListHouseholdsInput);
      case 'find_household_by_name':
        return await handleFindHouseholdByName(ctx, input as FindHouseholdByNameInput);
      case 'get_unbilled_summary':
        return await handleGetUnbilledSummary(ctx, input as GetUnbilledSummaryInput);
      default:
        return { error: `Read tool ${name} not implemented.` };
    }
  } catch (e: any) {
    return { error: e?.message ?? 'Read tool failed.' };
  }
}

type PreviewResult =
  | { kind: 'success'; preview: AnyPreview }
  | { kind: 'failure'; message: string };

async function runWritePreview(
  ctx: ToolCallerContext,
  name: ToolName,
  input: unknown,
  anthropicKey: string,
): Promise<PreviewResult> {
  const wrap = <T extends AnyPreview>(r: { kind: 'success'; value: T } | { kind: 'failure'; message: string }): PreviewResult => {
    if (r.kind === 'success') return { kind: 'success', preview: r.value };
    return { kind: 'failure', message: r.message };
  };

  switch (name) {
    case 'log_session':
      return wrap(await previewLogSession(ctx, input as LogSessionInput));
    case 'polish_notes':
      return wrap(await previewPolishNotes(ctx, input as PolishNotesInput, anthropicKey));
    case 'create_student':
      return wrap(await previewCreateStudent(ctx, input as CreateStudentInput));
    case 'update_student':
      return wrap(await previewUpdateStudent(ctx, input as UpdateStudentInput));
    case 'archive_student':
      return wrap(await previewArchiveStudent(ctx, input as ArchiveStudentInput));
    case 'create_invoice':
      return wrap(await previewCreateInvoice(ctx, input as CreateInvoiceInput));
    case 'mark_invoice_paid':
      return wrap(await previewMarkInvoicePaid(ctx, input as MarkInvoicePaidInput));
    case 'send_parent_update':
      return wrap(await previewSendParentUpdate(ctx, input as SendParentUpdateInput, anthropicKey));
    case 'send_message':
      return wrap(await previewSendMessage(ctx, input as SendMessageInput));
    case 'mark_notifications_read':
      return wrap(await previewMarkNotificationsRead(ctx, input as MarkNotificationsReadInput));
    case 'add_student_to_household':
      return wrap(await previewAddStudentToHousehold(ctx, input as AddStudentToHouseholdInput));
    case 'create_batch_invoices':
      return wrap(await previewCreateBatchInvoices(ctx, input as CreateBatchInvoicesInput));
    case 'create_test_account':
      return wrap(await previewCreateTestAccount(ctx, input as CreateTestAccountInput));
    case 'assign_student_to_tutor':
      return wrap(await previewAssignStudentToTutor(ctx, input as AssignStudentToTutorInput));
    default:
      return { kind: 'failure', message: `Write tool ${name} not implemented.` };
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export async function resolveOrgName(
  client: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data } = await client
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();
  return data?.name ?? 'Your organisation';
}

export async function persistToolResult(
  client: SupabaseClient,
  args: {
    conversation_id: string;
    organization_id: string;
    user_id: string;
    tool_use_id: string;
    payload: Record<string, unknown>;
  },
): Promise<DbMessageRow> {
  return insertRow(client, {
    conversation_id: args.conversation_id,
    organization_id: args.organization_id,
    user_id: args.user_id,
    role: 'tool_result',
    content: { tool_use_id: args.tool_use_id, ...args.payload },
  });
}

export async function persistUserText(
  client: SupabaseClient,
  args: { conversation_id: string; organization_id: string; user_id: string; text: string },
): Promise<DbMessageRow> {
  return insertRow(client, {
    conversation_id: args.conversation_id,
    organization_id: args.organization_id,
    user_id: args.user_id,
    role: 'user',
    content: { text: args.text },
  });
}
