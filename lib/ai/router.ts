// Smart model routing for Crestio.
//
// Picks the cheapest viable model for each task type, with a quality fallback
// that escalates Haiku → Sonnet for polish output that fails a simple smell
// test. Every call is logged to ai_call_logs (cost + escalation flag) so
// /admin/ai-costs can show weekly rollups by user / task / escalation rate.
//
// All call sites should go through callAI() — direct Anthropic calls outside
// this file defeat the routing + cost logging.

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export type AITaskType =
  | 'polish'
  | 'lesson_plan'
  | 'assistant_simple'
  | 'assistant_complex'
  | 'session_summary'
  | 'voice_diff'
  | 'voice_profile';

// Pricing (USD per million tokens) as of 2026-04-27. Update when Anthropic
// changes published rates — the cost column on ai_call_logs is captured at
// call time, so historical rows stay accurate even if these constants change.
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

type Pricing = { inputPerMTok: number; outputPerMTok: number };
const PRICING: Record<string, Pricing> = {
  [HAIKU_MODEL]: { inputPerMTok: 1, outputPerMTok: 5 },
  [SONNET_MODEL]: { inputPerMTok: 3, outputPerMTok: 15 },
};

export function getModelForTask(task: AITaskType): string {
  switch (task) {
    case 'polish':
    case 'session_summary':
    case 'assistant_simple':
    case 'voice_diff':
    case 'voice_profile':
      return HAIKU_MODEL;
    case 'lesson_plan':
    case 'assistant_complex':
      return SONNET_MODEL;
  }
}

const COMPLEX_KEYWORDS = [
  'explain', 'why', 'how does', 'compare', 'analyze', 'analyse', 'plan', 'design',
];

// Heuristic for assistant routing. >800 chars or any complex keyword pushes
// to Sonnet; everything else stays on Haiku. Cheap to be wrong — escalation
// happens via the user typing a follow-up.
export function classifyAssistantQuery(input: string): 'assistant_simple' | 'assistant_complex' {
  if ((input ?? '').length > 800) return 'assistant_complex';
  const lower = (input ?? '').toLowerCase();
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 'assistant_complex';
  return 'assistant_simple';
}

const REFUSAL_PATTERNS = [
  /^i cannot\b/i,
  /^i can'?t\b/i,
  /^i'?m sorry,? but\b/i,
  /^sorry,? (i|but)\b/i,
  /^as an ai\b/i,
];

// Minimum bar for polish output: substantive length, ends like a sentence,
// no obvious refusal. Sonnet retries any output that fails this.
export function polishOutputPassesQuality(output: string): boolean {
  const text = (output ?? '').trim();
  if (text.length < 80) return false;
  if (!/[.!?]/.test(text)) return false;
  if (REFUSAL_PATTERNS.some((re) => re.test(text))) return false;
  // Truncation smell: ends mid-word with no terminal punctuation in last 10 chars.
  const tail = text.slice(-12);
  if (!/[.!?"'\)\]]$/.test(tail)) return false;
  return true;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cost = (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

async function logCall(args: {
  userId: string;
  organizationId: string;
  taskType: AITaskType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  escalated: boolean;
}): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const { error } = await admin.from('ai_call_logs').insert({
    user_id: args.userId,
    organization_id: args.organizationId,
    task_type: args.taskType,
    model: args.model,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cost_usd: computeCostUsd(args.model, args.inputTokens, args.outputTokens),
    escalated: args.escalated,
  });
  if (error) {
    console.error('[ai/router] ai_call_logs insert failed (non-fatal)', error);
  }
}

export type CallAIOpts = {
  task: AITaskType;
  systemPrompt?: string;
  userPrompt: string;
  userId: string;
  organizationId: string;
  maxTokens?: number;
};

export type CallAIResult = {
  text: string;
  model: string;
  escalated: boolean;
  inputTokens: number;
  outputTokens: number;
};

// Single entry point for AI calls. Picks model, calls Anthropic, logs cost.
// For task='polish', escalates Haiku → Sonnet automatically when the output
// fails polishOutputPassesQuality(); the second call is logged with
// escalated=true so we can track the rate.
export async function callAI(opts: CallAIOpts): Promise<CallAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const anthropic = new Anthropic({ apiKey });
  const maxTokens = opts.maxTokens ?? 800;
  const model = getModelForTask(opts.task);

  const messages = [{ role: 'user' as const, content: opts.userPrompt }];
  const baseArgs: any = { max_tokens: maxTokens, messages };
  if (opts.systemPrompt) baseArgs.system = opts.systemPrompt;

  const first = await anthropic.messages.create({ ...baseArgs, model });
  const firstText = ((first.content.find((b: any) => b.type === 'text') as any)?.text ?? '').trim();
  const firstUsage = first.usage ?? { input_tokens: 0, output_tokens: 0 };

  // Polish quality gate: escalate to Sonnet if Haiku output fails.
  if (opts.task === 'polish' && model === HAIKU_MODEL && !polishOutputPassesQuality(firstText)) {
    await logCall({
      userId: opts.userId,
      organizationId: opts.organizationId,
      taskType: opts.task,
      model,
      inputTokens: firstUsage.input_tokens,
      outputTokens: firstUsage.output_tokens,
      escalated: false,
    });

    const retry = await anthropic.messages.create({ ...baseArgs, model: SONNET_MODEL });
    const retryText = ((retry.content.find((b: any) => b.type === 'text') as any)?.text ?? '').trim();
    const retryUsage = retry.usage ?? { input_tokens: 0, output_tokens: 0 };
    await logCall({
      userId: opts.userId,
      organizationId: opts.organizationId,
      taskType: opts.task,
      model: SONNET_MODEL,
      inputTokens: retryUsage.input_tokens,
      outputTokens: retryUsage.output_tokens,
      escalated: true,
    });

    return {
      text: retryText,
      model: SONNET_MODEL,
      escalated: true,
      inputTokens: retryUsage.input_tokens,
      outputTokens: retryUsage.output_tokens,
    };
  }

  await logCall({
    userId: opts.userId,
    organizationId: opts.organizationId,
    taskType: opts.task,
    model,
    inputTokens: firstUsage.input_tokens,
    outputTokens: firstUsage.output_tokens,
    escalated: false,
  });

  return {
    text: firstText,
    model,
    escalated: false,
    inputTokens: firstUsage.input_tokens,
    outputTokens: firstUsage.output_tokens,
  };
}

// Exported for tests and admin views.
export const _internal = { HAIKU_MODEL, SONNET_MODEL, PRICING, computeCostUsd };
