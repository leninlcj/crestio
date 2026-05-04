import { describe, it, expect } from 'vitest';
import { getModelForTask, classifyAssistantQuery, polishOutputPassesQuality, _internal } from '@/lib/ai/router';

describe('getModelForTask', () => {
  it('routes voice tasks to Haiku', () => {
    expect(getModelForTask('voice_diff')).toBe(_internal.HAIKU_MODEL);
    expect(getModelForTask('voice_profile')).toBe(_internal.HAIKU_MODEL);
  });

  it('keeps existing Haiku routing intact', () => {
    expect(getModelForTask('polish')).toBe(_internal.HAIKU_MODEL);
    expect(getModelForTask('session_summary')).toBe(_internal.HAIKU_MODEL);
    expect(getModelForTask('assistant_simple')).toBe(_internal.HAIKU_MODEL);
  });

  it('keeps existing Sonnet routing intact', () => {
    expect(getModelForTask('lesson_plan')).toBe(_internal.SONNET_MODEL);
    expect(getModelForTask('assistant_complex')).toBe(_internal.SONNET_MODEL);
  });
});

describe('classifyAssistantQuery', () => {
  it('classifies short factual queries as simple', () => {
    expect(classifyAssistantQuery('what time is the next session')).toBe('assistant_simple');
  });

  it('classifies queries with reasoning keywords as complex', () => {
    expect(classifyAssistantQuery('why does this student keep missing')).toBe('assistant_complex');
    expect(classifyAssistantQuery('explain the trend')).toBe('assistant_complex');
  });

  it('classifies long queries as complex regardless of content', () => {
    expect(classifyAssistantQuery('a'.repeat(900))).toBe('assistant_complex');
  });
});

describe('polishOutputPassesQuality', () => {
  it('rejects refusals, short, and truncated outputs', () => {
    expect(polishOutputPassesQuality('I cannot help with that.')).toBe(false);
    expect(polishOutputPassesQuality('too short')).toBe(false);
    expect(polishOutputPassesQuality('A perfectly long response that ends mid-word becau')).toBe(false);
  });

  it('accepts substantive outputs ending in a sentence', () => {
    const ok = 'Sam worked steadily through quadratic equations today, getting most of the discriminant cases right with one slip on the negative case. Homework: redo problems three through six.';
    expect(polishOutputPassesQuality(ok)).toBe(true);
  });
});
