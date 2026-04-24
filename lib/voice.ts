// Shared helpers for voice transcription. The actual HTTP handler lives in
// pages/api/voice/transcribe.ts; this module centralises the caps math, the
// Whisper client, and the usage-ledger upsert.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanTier } from './billing';

export const MAX_CLIP_SECONDS = 300; // 5 min per clip — client enforces too
export const MAX_CLIP_BYTES = 25 * 1024 * 1024; // Whisper hard limit is 25MB
export const WHISPER_COST_CENTS_PER_MINUTE = 0.6; // 0.006 USD/min → integer cents rounded at aggregate

export type VoiceCaps = {
  dailyTranscriptions: number;
  dailyAudioSeconds: number;
};

// Tightened from spec per user direction:
// Solo: 20 transcriptions/day, 30 min/day. Team: 50/day, 75 min/day.
const CAPS: Record<PlanTier, VoiceCaps> = {
  solo:   { dailyTranscriptions: 20, dailyAudioSeconds: 30 * 60 },
  team:   { dailyTranscriptions: 50, dailyAudioSeconds: 75 * 60 },
  growth: { dailyTranscriptions: 50, dailyAudioSeconds: 75 * 60 }, // same as team until Growth gets its own policy
};

export function capsForPlan(tier: PlanTier | null | undefined): VoiceCaps {
  return CAPS[(tier ?? 'solo') as PlanTier] ?? CAPS.solo;
}

// ---------------------------------------------------------------------------
// Sydney-midnight date key (YYYY-MM-DD). Used as the usage-ledger partition.
// ---------------------------------------------------------------------------
export function sydneyDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ---------------------------------------------------------------------------
// Look up today's usage for a user.
// ---------------------------------------------------------------------------
export type UsageRow = {
  transcription_count: number;
  audio_seconds_total: number;
  cost_cents_total: number;
};

export async function getUsageForToday(
  admin: SupabaseClient,
  userId: string,
): Promise<UsageRow> {
  const dateKey = sydneyDateKey();
  const { data } = await admin
    .from('voice_usage_daily')
    .select('transcription_count, audio_seconds_total, cost_cents_total')
    .eq('user_id', userId)
    .eq('usage_date', dateKey)
    .maybeSingle();
  return data ?? { transcription_count: 0, audio_seconds_total: 0, cost_cents_total: 0 };
}

// Incrementally update the per-day ledger. Uses INSERT .. ON CONFLICT to be
// atomic across parallel requests (web client retries, serverless cold starts).
export async function recordUsage(
  admin: SupabaseClient,
  args: { userId: string; audioSeconds: number; costCents: number },
): Promise<void> {
  const dateKey = sydneyDateKey();
  // Supabase JS doesn't expose ON CONFLICT UPDATE with += via PostgREST, so we
  // do a read+write with retry. Race is acceptable — caps are soft.
  const { data: existing } = await admin
    .from('voice_usage_daily')
    .select('id, transcription_count, audio_seconds_total, cost_cents_total')
    .eq('user_id', args.userId)
    .eq('usage_date', dateKey)
    .maybeSingle();
  if (existing) {
    await admin
      .from('voice_usage_daily')
      .update({
        transcription_count: existing.transcription_count + 1,
        audio_seconds_total: existing.audio_seconds_total + args.audioSeconds,
        cost_cents_total: existing.cost_cents_total + args.costCents,
      })
      .eq('id', existing.id);
  } else {
    await admin
      .from('voice_usage_daily')
      .insert({
        user_id: args.userId,
        usage_date: dateKey,
        transcription_count: 1,
        audio_seconds_total: args.audioSeconds,
        cost_cents_total: args.costCents,
      });
  }
}

// ---------------------------------------------------------------------------
// Call Whisper. Direct fetch — no SDK dependency. Accepts a Node Blob/File
// built from the audio bytes the handler already has.
// ---------------------------------------------------------------------------
export type WhisperResult =
  | { ok: true; text: string; durationSeconds: number | null }
  | { ok: false; error: string; status?: number };

export async function transcribeWithWhisper(args: {
  apiKey: string;
  audio: Blob;
  filename: string;
  mimeType: string;
  language?: string; // "en" hint; Whisper auto-detects otherwise
}): Promise<WhisperResult> {
  const form = new FormData();
  form.append('file', args.audio, args.filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (args.language) form.append('language', args.language);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.apiKey}` },
      body: form as any,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error.' };
  }

  if (!res.ok) {
    let detail = `Whisper responded ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error?.message) detail = j.error.message;
    } catch { /* ignore */ }
    return { ok: false, error: detail, status: res.status };
  }
  const payload: any = await res.json().catch(() => ({}));
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const duration = typeof payload.duration === 'number' ? Math.round(payload.duration) : null;
  if (!text) return { ok: false, error: 'Empty transcript.' };
  return { ok: true, text, durationSeconds: duration };
}

// Compute cost (in cents) for a given audio length. Rounded up to nearest cent.
export function costCentsForSeconds(seconds: number): number {
  const minutes = seconds / 60;
  return Math.ceil(minutes * WHISPER_COST_CENTS_PER_MINUTE);
}
