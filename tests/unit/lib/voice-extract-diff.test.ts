import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI router so the test never reaches Anthropic.
const callAIMock = vi.fn();
vi.mock('@/lib/ai/router', () => ({
  callAI: (...args: unknown[]) => callAIMock(...args),
}));

import { extractDiffSummary, buildDiffPrompt } from '@/lib/voice/extractDiff';

describe('buildDiffPrompt', () => {
  it('embeds both texts and the requested language', () => {
    const prompt = buildDiffPrompt('Hello world.', 'Hi there.', 'es');
    expect(prompt).toContain('Hello world.');
    expect(prompt).toContain('Hi there.');
    expect(prompt).toContain('Spanish');
    expect(prompt).toContain('FIRST (AI-polished output):');
    expect(prompt).toContain('SECOND (tutor\'s edited version):');
  });

  it('caps very long inputs to keep tokens bounded', () => {
    const long = 'x'.repeat(8000);
    const prompt = buildDiffPrompt(long, long, 'en');
    // Each side capped at 4000; full source text shouldn't appear.
    expect(prompt.includes('x'.repeat(8000))).toBe(false);
    // But each side should still have a long run.
    expect(prompt).toMatch(/x{4000}/);
  });

  it('asks for a max-12-word phrase', () => {
    const prompt = buildDiffPrompt('a', 'b', 'en');
    expect(prompt).toMatch(/max 12 words/);
  });
});

describe('extractDiffSummary', () => {
  beforeEach(() => {
    callAIMock.mockReset();
  });

  it('returns empty string for empty inputs without calling the API', async () => {
    const out = await extractDiffSummary({
      before: '', after: 'hello', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it('returns empty string when before and after are identical', async () => {
    const out = await extractDiffSummary({
      before: 'same', after: 'same', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it('returns the trimmed phrase from the AI when texts differ', async () => {
    callAIMock.mockResolvedValueOnce({
      text: '  Shorter declarative sentences. ',
      model: 'haiku', escalated: false, inputTokens: 10, outputTokens: 5,
    });
    const out = await extractDiffSummary({
      before: 'Long, flowery prose.', after: 'Short. Direct.', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('Shorter declarative sentences.');
    expect(callAIMock).toHaveBeenCalledOnce();
    const args = callAIMock.mock.calls[0][0];
    expect(args.task).toBe('voice_diff');
    expect(args.userId).toBe('u');
    expect(args.organizationId).toBe('o');
  });

  it('strips wrapping quotes from the AI response', async () => {
    callAIMock.mockResolvedValueOnce({
      text: '"prefers concrete verbs"',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const out = await extractDiffSummary({
      before: 'a', after: 'b', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('prefers concrete verbs');
  });

  it('clamps output to 12 words', async () => {
    callAIMock.mockResolvedValueOnce({
      text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const out = await extractDiffSummary({
      before: 'a', after: 'b', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out.split(/\s+/)).toHaveLength(12);
    expect(out.endsWith('twelve')).toBe(true);
  });

  it('returns empty when AI says no meaningful change', async () => {
    callAIMock.mockResolvedValueOnce({
      text: 'no meaningful style change',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const out = await extractDiffSummary({
      before: 'a', after: 'b', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
  });

  it('returns empty when the AI throws — never propagates', async () => {
    callAIMock.mockRejectedValueOnce(new Error('upstream 502'));
    const out = await extractDiffSummary({
      before: 'a', after: 'b', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
  });

  it('returns empty when the AI response is blank', async () => {
    callAIMock.mockResolvedValueOnce({
      text: '   ',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const out = await extractDiffSummary({
      before: 'a', after: 'b', locale: 'en',
      userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
  });
});
