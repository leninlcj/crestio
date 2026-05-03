// Deterministic Anthropic mock for tests. In CI we set ANTHROPIC_MOCK=1 and
// any code path that calls `messages.create` should pick up the mock and
// return a fixed polished string. Tests can also pass `respondWith` to
// inject a specific response per case.

import { vi } from 'vitest';

export type MockAnthropicOptions = {
  respondWith?: string;
  // Echo the last `n` chars of the prompt back so tests can assert routing.
  echoPrompt?: boolean;
};

const DEFAULT_POLISHED = `Today's session focused on quadratic equations. Sam worked through six worked examples and started to recognise when to factor versus complete the square.

A small win: he caught his own sign error on problem four, which suggests his self-checking is improving. Watch the discriminant step — that's where mistakes still creep in.

For next week, please ask Sam to redo problems 11 and 14 from the textbook before our session.`;

export function createMockAnthropic(opts: MockAnthropicOptions = {}) {
  const messages = {
    create: vi.fn(async (params: { messages?: Array<{ role: string; content: unknown }>; system?: string; max_tokens?: number }) => {
      const body =
        opts.respondWith ??
        (opts.echoPrompt
          ? `MOCK_ECHO: ${JSON.stringify(params.messages?.[0]?.content ?? '').slice(0, 200)}`
          : DEFAULT_POLISHED);
      return {
        id: 'msg_mock_' + Math.random().toString(36).slice(2, 8),
        type: 'message',
        role: 'assistant',
        model: 'claude-mock',
        content: [{ type: 'text', text: body }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 80 },
      };
    }),
  };

  return { messages };
}

export type MockAnthropic = ReturnType<typeof createMockAnthropic>;

export function isAnthropicMockedInEnv(): boolean {
  return process.env.ANTHROPIC_MOCK === '1';
}
