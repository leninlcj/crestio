import { callAI } from '../ai/router';
import { LOCALE_AI_NAME } from '../i18n';
import type { SupportedLocale } from '../i18n';

export type ExtractDiffArgs = {
  before: string;
  after: string;
  locale: SupportedLocale;
  userId: string;
  organizationId: string;
};

const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_WORDS = 12;

export function buildDiffPrompt(before: string, after: string, locale: SupportedLocale): string {
  const language = LOCALE_AI_NAME[locale];
  const trimBefore = before.length > MAX_INPUT_CHARS ? before.slice(0, MAX_INPUT_CHARS) : before;
  const trimAfter = after.length > MAX_INPUT_CHARS ? after.slice(0, MAX_INPUT_CHARS) : after;

  return `You analyse how a tutor edits AI-polished session notes so we can learn the tutor's voice.

In one short phrase (max ${MAX_OUTPUT_WORDS} words), describe how the second text differs in style from the first. Focus on tone, sentence length, formality, punctuation, vocabulary. Ignore content changes, only describe stylistic edits.

If the texts are essentially the same, reply exactly: no meaningful style change.

Reply in English even if the texts are in ${language}. Output only the phrase. No preamble, no quotes, no list markers.

FIRST (AI-polished output):
${trimBefore}

SECOND (tutor's edited version):
${trimAfter}`;
}

function clampWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return words.slice(0, max).join(' ');
}

// Returns a short phrase describing the stylistic delta between AI output and
// the tutor's edit. Returns '' when there's nothing meaningful to learn or on
// any failure — callers must never propagate this error to the user.
export async function extractDiffSummary(args: ExtractDiffArgs): Promise<string> {
  const before = (args.before ?? '').trim();
  const after = (args.after ?? '').trim();
  if (!before || !after) return '';
  if (before === after) return '';

  try {
    const result = await callAI({
      task: 'voice_diff',
      userPrompt: buildDiffPrompt(before, after, args.locale),
      maxTokens: 80,
      userId: args.userId,
      organizationId: args.organizationId,
    });
    const raw = (result.text ?? '').trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ');
    if (!raw) return '';
    if (/^no meaningful style change$/i.test(raw)) return '';
    return clampWords(raw, MAX_OUTPUT_WORDS);
  } catch {
    return '';
  }
}
