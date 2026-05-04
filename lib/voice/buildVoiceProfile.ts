import { callAI } from '../ai/router';
import { LOCALE_AI_NAME } from '../i18n';
import type { SupportedLocale } from '../i18n';

export type VoiceSample = {
  diff_summary: string | null;
  before_text: string;
  after_text: string;
};

export type BuildVoiceProfileArgs = {
  samples: VoiceSample[];
  locale: SupportedLocale;
  userId: string;
  organizationId: string;
};

// Sample-count thresholds at which we re-distil the profile after each new
// edit. Past 50 we throttle to once every 25 to keep cost bounded; the
// daily cron also keeps it fresh at most once a week.
export const PROFILE_REBUILD_THRESHOLDS = [3, 10, 20, 50] as const;
export const PROFILE_REBUILD_STEP_AFTER_50 = 25;

export function shouldRebuildProfile(sampleCount: number): boolean {
  if (PROFILE_REBUILD_THRESHOLDS.includes(sampleCount as 3 | 10 | 20 | 50)) return true;
  if (sampleCount > 50 && sampleCount % PROFILE_REBUILD_STEP_AFTER_50 === 0) return true;
  return false;
}

const MAX_SAMPLES_USED = 20;
const MAX_SAMPLE_TEXT_CHARS = 600;

export function buildVoiceProfilePrompt(samples: VoiceSample[], locale: SupportedLocale): string {
  const language = LOCALE_AI_NAME[locale];
  const recent = samples.slice(0, MAX_SAMPLES_USED);

  const summariesBlock = recent
    .map((s, i) => {
      const summary = (s.diff_summary ?? '').trim();
      if (summary) return `${i + 1}. ${summary}`;
      // Fallback to truncated before/after if we don't have a summary —
      // gives the model some signal even when extractDiff failed earlier.
      const before = (s.before_text ?? '').slice(0, MAX_SAMPLE_TEXT_CHARS).replace(/\s+/g, ' ').trim();
      const after = (s.after_text ?? '').slice(0, MAX_SAMPLE_TEXT_CHARS).replace(/\s+/g, ' ').trim();
      return `${i + 1}. (no summary) BEFORE: ${before} | AFTER: ${after}`;
    })
    .join('\n');

  return `These are diff summaries showing how a tutor consistently edits AI-polished session notes (the polish output is in ${language}).

Distil the recurring style choices into a 2-3 sentence style guide that another instance of the same AI can apply BEFORE the tutor sees the next polish, so the polish already matches their voice.

Be specific. Useful examples:
  - "Prefers short declarative sentences; rarely uses subordinate clauses."
  - "Never uses exclamation marks or em-dashes."
  - "Addresses the parent by first name in the first sentence."
  - "Avoids the word 'engaged'; prefers concrete verbs like 'worked through', 'tried', 'asked'."

Skip generic platitudes. Skip rules that appeared in only one sample.

Output only the 2-3 sentence guide. No bullets, no preamble, no headings.

EDITS (most recent first):
${summariesBlock}`;
}

// Distil ~20 recent samples into a short voice guide. Returns '' on failure.
export async function buildVoiceProfile(args: BuildVoiceProfileArgs): Promise<string> {
  const samples = (args.samples ?? []).slice(0, MAX_SAMPLES_USED);
  if (samples.length < PROFILE_REBUILD_THRESHOLDS[0]) return '';

  try {
    const result = await callAI({
      task: 'voice_profile',
      userPrompt: buildVoiceProfilePrompt(samples, args.locale),
      maxTokens: 300,
      userId: args.userId,
      organizationId: args.organizationId,
    });
    const text = (result.text ?? '').trim();
    if (!text) return '';
    return text;
  } catch {
    return '';
  }
}
