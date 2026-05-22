import { LogLevel } from '@mastra/core/logger';
import { describe, expect, it, vi } from 'vitest';

import { TyphoonLogger } from './logger';

/**
 * Smoke test: verifies the logger can serialize objects that mirror what the
 * Mastra OTEL bridge produces at runtime.
 *
 * When Mastra observability is enabled, `onStepFinish` callbacks pass
 * `toolCalls` / `toolResults` objects containing OTEL span proxies with
 * circular references (span → parent → children → span). Bare
 * `JSON.stringify` crashes on these — the logger must handle them safely.
 */
describe('observability compatibility', () => {
  it('logs tool results with circular span references without throwing', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });

    // Simulate the structure Mastra creates: spans reference their parent,
    // parents reference their children, and tool results carry span refs.
    const parentSpan: Record<string, unknown> = { id: 'span-parent', children: [] };
    const childSpan: Record<string, unknown> = { id: 'span-child', parent: parentSpan };
    (parentSpan.children as unknown[]).push(childSpan);

    const toolCall = {
      type: 'tool-call',
      payload: {
        toolName: 'searchKnowledge',
        args: { prompt: 'test' },
        span: childSpan, // circular via parent → children → child → parent
      },
    };

    expect(() => {
      logger.debug('Stream step change', {
        text: 'Let me look that up',
        toolCalls: [toolCall],
        toolResults: [],
        finishReason: 'tool-calls',
      });
    }).not.toThrow();

    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('[Circular]');
    expect(output).toContain('searchKnowledge');
    spy.mockRestore();
  });
});
