import { describe, it, expect, vi, beforeEach } from 'vitest';

const callAIMock = vi.fn();
vi.mock('@/lib/ai/router', () => ({
  callAI: (...args: unknown[]) => callAIMock(...args),
}));

import {
  buildVoiceProfile,
  buildVoiceProfilePrompt,
  shouldRebuildProfile,
  PROFILE_REBUILD_THRESHOLDS,
  type VoiceSample,
} from '@/lib/voice/buildVoiceProfile';

describe('shouldRebuildProfile', () => {
  it('triggers at the documented thresholds', () => {
    for (const n of PROFILE_REBUILD_THRESHOLDS) {
      expect(shouldRebuildProfile(n)).toBe(true);
    }
  });

  it('triggers every 25 past 50', () => {
    expect(shouldRebuildProfile(75)).toBe(true);
    expect(shouldRebuildProfile(100)).toBe(true);
    expect(shouldRebuildProfile(125)).toBe(true);
  });

  it('does not trigger at non-threshold counts', () => {
    expect(shouldRebuildProfile(0)).toBe(false);
    expect(shouldRebuildProfile(2)).toBe(false);
    expect(shouldRebuildProfile(4)).toBe(false);
    expect(shouldRebuildProfile(11)).toBe(false);
    expect(shouldRebuildProfile(51)).toBe(false);
    expect(shouldRebuildProfile(60)).toBe(false);
  });
});

describe('buildVoiceProfilePrompt', () => {
  it('numbers the diff summaries in order', () => {
    const samples: VoiceSample[] = [
      { diff_summary: 'shorter sentences', before_text: 'a', after_text: 'b' },
      { diff_summary: 'no exclamation marks', before_text: 'a', after_text: 'b' },
      { diff_summary: 'first-name greetings', before_text: 'a', after_text: 'b' },
    ];
    const prompt = buildVoiceProfilePrompt(samples, 'en');
    expect(prompt).toContain('1. shorter sentences');
    expect(prompt).toContain('2. no exclamation marks');
    expect(prompt).toContain('3. first-name greetings');
  });

  it('falls back to before/after when diff_summary is missing', () => {
    const samples: VoiceSample[] = [
      { diff_summary: null, before_text: 'AI flowery output', after_text: 'short edit' },
    ];
    const prompt = buildVoiceProfilePrompt(samples, 'en');
    expect(prompt).toContain('(no summary)');
    expect(prompt).toContain('AI flowery output');
    expect(prompt).toContain('short edit');
  });

  it('caps to 20 samples', () => {
    const samples: VoiceSample[] = Array.from({ length: 50 }, (_, i) => ({
      diff_summary: `phrase ${i + 1}`,
      before_text: 'a',
      after_text: 'b',
    }));
    const prompt = buildVoiceProfilePrompt(samples, 'en');
    expect(prompt).toContain('20. phrase 20');
    expect(prompt).not.toContain('21. phrase 21');
  });

  it('mentions the target language', () => {
    expect(buildVoiceProfilePrompt(
      [{ diff_summary: 'x', before_text: 'a', after_text: 'b' }], 'es',
    )).toContain('Spanish');
    expect(buildVoiceProfilePrompt(
      [{ diff_summary: 'x', before_text: 'a', after_text: 'b' }], 'fr',
    )).toContain('French');
  });
});

describe('buildVoiceProfile', () => {
  beforeEach(() => {
    callAIMock.mockReset();
  });

  it('returns empty without calling the AI when below 3 samples', async () => {
    const out = await buildVoiceProfile({
      samples: [
        { diff_summary: 'a', before_text: '', after_text: '' },
        { diff_summary: 'b', before_text: '', after_text: '' },
      ],
      locale: 'en', userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it('returns the AI text on success', async () => {
    callAIMock.mockResolvedValueOnce({
      text: 'Prefers short declarative sentences. Never uses exclamation marks.',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const samples: VoiceSample[] = Array.from({ length: 5 }, (_, i) => ({
      diff_summary: `phrase ${i + 1}`,
      before_text: '',
      after_text: '',
    }));
    const out = await buildVoiceProfile({
      samples, locale: 'en', userId: 'u', organizationId: 'o',
    });
    expect(out).toContain('declarative sentences');
    const args = callAIMock.mock.calls[0][0];
    expect(args.task).toBe('voice_profile');
  });

  it('returns empty when the AI throws', async () => {
    callAIMock.mockRejectedValueOnce(new Error('boom'));
    const samples: VoiceSample[] = Array.from({ length: 5 }, (_, i) => ({
      diff_summary: `p${i}`, before_text: '', after_text: '',
    }));
    const out = await buildVoiceProfile({
      samples, locale: 'en', userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
  });

  it('returns empty when the AI response is blank', async () => {
    callAIMock.mockResolvedValueOnce({
      text: '   ',
      model: 'haiku', escalated: false, inputTokens: 0, outputTokens: 0,
    });
    const samples: VoiceSample[] = Array.from({ length: 5 }, (_, i) => ({
      diff_summary: `p${i}`, before_text: '', after_text: '',
    }));
    const out = await buildVoiceProfile({
      samples, locale: 'en', userId: 'u', organizationId: 'o',
    });
    expect(out).toBe('');
  });
});
