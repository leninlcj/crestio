import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupportedLocale, type SupportedLocale } from '../i18n';
import { extractDiffSummary } from './extractDiff';
import { buildVoiceProfile, shouldRebuildProfile, type VoiceSample } from './buildVoiceProfile';

export type ProcessVoiceSampleArgs = {
  userId: string;
  organizationId: string;
  sessionId: string | null;
  beforeText: string;
  afterText: string;
  accepted: boolean;
  // userClient enforces RLS on the insert. admin bypasses RLS for the
  // counter + threshold writes.
  userClient: SupabaseClient;
  admin: SupabaseClient;
};

export type ProcessVoiceSampleResult = {
  inserted: boolean;
  sampleCount: number;
  rebuilt: boolean;
  diffSummary: string;
};

// Single source of truth for: extract diff → insert sample → bump counter →
// rebuild profile on threshold. Both log-polish-edit and send-polish-to-parent
// call this with the same shape.
export async function processVoiceSample(
  args: ProcessVoiceSampleArgs,
): Promise<ProcessVoiceSampleResult> {
  const before = (args.beforeText ?? '').trim();
  const after = (args.afterText ?? '').trim();
  const empty: ProcessVoiceSampleResult = {
    inserted: false, sampleCount: 0, rebuilt: false, diffSummary: '',
  };

  if (!before || !after) return empty;
  if (before === after && args.accepted) {
    // No-edit accepted send: still useful as a "the tutor was happy with the
    // raw polish" signal. We record it without an LLM call (no diff to extract).
    const ok = await insertSample(args, '');
    if (!ok) return empty;
    const total = await refreshCounter(args.admin, args.userId);
    if (!shouldRebuildProfile(total)) return { inserted: true, sampleCount: total, rebuilt: false, diffSummary: '' };
    const profile = await rebuildProfile(args.admin, args.userId, args.organizationId);
    return { inserted: true, sampleCount: total, rebuilt: !!profile, diffSummary: '' };
  }

  const locale = await loadLocale(args.admin, args.userId);

  const diffSummary = await extractDiffSummary({
    before, after, locale,
    userId: args.userId,
    organizationId: args.organizationId,
  });

  const ok = await insertSample(args, diffSummary);
  if (!ok) return { ...empty, diffSummary };

  const total = await refreshCounter(args.admin, args.userId);
  if (!args.accepted) return { inserted: true, sampleCount: total, rebuilt: false, diffSummary };
  if (!shouldRebuildProfile(total)) return { inserted: true, sampleCount: total, rebuilt: false, diffSummary };

  const profile = await rebuildProfile(args.admin, args.userId, args.organizationId);
  return { inserted: true, sampleCount: total, rebuilt: !!profile, diffSummary };
}

async function loadLocale(admin: SupabaseClient, userId: string): Promise<SupportedLocale> {
  const { data: profile } = await admin
    .from('profiles').select('locale').eq('id', userId).maybeSingle();
  const raw = (profile as any)?.locale;
  return isSupportedLocale(raw) ? (raw as SupportedLocale) : 'en';
}

async function insertSample(args: ProcessVoiceSampleArgs, diffSummary: string): Promise<boolean> {
  const { error } = await args.userClient
    .from('tutor_voice_samples')
    .insert({
      organization_id: args.organizationId,
      tutor_user_id: args.userId,
      session_id: args.sessionId,
      before_text: args.beforeText,
      after_text: args.afterText,
      diff_summary: diffSummary || null,
      accepted: args.accepted,
    });
  if (error) {
    console.error('[voice/sample] insert failed', error);
    return false;
  }
  return true;
}

async function refreshCounter(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from('tutor_voice_samples')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_user_id', userId)
    .eq('accepted', true);
  const total = count ?? 0;
  await admin
    .from('profiles')
    .update({ voice_profile_sample_count: total })
    .eq('id', userId);
  return total;
}

async function rebuildProfile(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<string> {
  const locale = await loadLocale(admin, userId);
  const { data: rows } = await admin
    .from('tutor_voice_samples')
    .select('diff_summary, before_text, after_text')
    .eq('tutor_user_id', userId)
    .eq('accepted', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const samples = (rows ?? []) as VoiceSample[];
  const profile = await buildVoiceProfile({
    samples, locale, userId, organizationId,
  });
  if (profile) {
    await admin
      .from('profiles')
      .update({
        voice_profile_summary: profile,
        voice_profile_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
  }
  return profile;
}

// Exposed for the daily cron's per-tutor refresh path.
export async function rebuildProfileForTutor(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<string> {
  return rebuildProfile(admin, userId, organizationId);
}
