import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { extractTitleFromMessages, shouldSeedMessages } from './chat-utils';

// ── Helper to build UIMessage objects ─────────────────────────────

function makeMessage(overrides: Record<string, unknown>): UIMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    parts: [],
    ...overrides,
  } as unknown as UIMessage;
}

// ── extractTitleFromMessages ──────────────────────────────────────

describe('extractTitleFromMessages', () => {
  it('extracts title from data-thread-title stream part (fast path)', () => {
    const messages = [
      makeMessage({
        parts: [{ type: 'data-thread-title', data: { title: 'Stream Title' } }],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('Stream Title');
  });

  it('prefers data-thread-title part over tool output', () => {
    const messages = [
      makeMessage({
        parts: [
          { type: 'data-thread-title', data: { title: 'Early Title' } },
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'Late Title' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('Early Title');
  });

  it('ignores data-thread-title part with missing title', () => {
    const messages = [
      makeMessage({
        parts: [
          { type: 'data-thread-title', data: {} },
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'Fallback Title' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('Fallback Title');
  });

  it('extracts title from tool-setThreadTitle part', () => {
    const messages = [
      makeMessage({
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'My Thread Title' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('My Thread Title');
  });

  it('extracts title from dynamic-tool part with toolName setThreadTitle', () => {
    const messages = [
      makeMessage({
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'setThreadTitle',
            state: 'output-available',
            output: { title: 'Dynamic Title' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('Dynamic Title');
  });

  it('returns null when no tool calls match', () => {
    const messages = [
      makeMessage({
        parts: [{ type: 'text', text: 'Hello there' }],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBeNull();
  });

  it('returns null for empty messages array', () => {
    expect(extractTitleFromMessages([])).toBeNull();
  });

  it('returns null when state is not output-available', () => {
    const messages = [
      makeMessage({
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'pending',
            output: { title: 'Should Not Match' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBeNull();
  });

  it('returns null when output has no title', () => {
    const messages = [
      makeMessage({
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: {},
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBeNull();
  });

  it('finds title in the last message when multiple messages exist', () => {
    const messages = [
      makeMessage({
        id: 'msg-1',
        parts: [{ type: 'text', text: 'First message' }],
      }),
      makeMessage({
        id: 'msg-2',
        parts: [{ type: 'text', text: 'Second message' }],
      }),
      makeMessage({
        id: 'msg-3',
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'Found In Last' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('Found In Last');
  });

  it('returns the first title found when multiple exist', () => {
    const messages = [
      makeMessage({
        id: 'msg-1',
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'First Title' },
          },
        ],
      }),
      makeMessage({
        id: 'msg-2',
        parts: [
          {
            type: 'tool-setThreadTitle',
            state: 'output-available',
            output: { title: 'Second Title' },
          },
        ],
      }),
    ];
    expect(extractTitleFromMessages(messages)).toBe('First Title');
  });

  it('handles messages with no parts gracefully', () => {
    const messages = [makeMessage({ parts: undefined })];
    expect(extractTitleFromMessages(messages)).toBeNull();
  });
});

// ── shouldSeedMessages ────────────────────────────────────────────

describe('shouldSeedMessages', () => {
  const serverMessages: UIMessage[] = [
    makeMessage({ id: 'server-1', role: 'user', content: 'Hello' }),
    makeMessage({ id: 'server-2', role: 'assistant', content: 'Hi there' }),
  ];

  it('returns true when chat is empty and server data is available', () => {
    expect(shouldSeedMessages(0, serverMessages, 'ready', false)).toBe(true);
  });

  it('returns false when already seeded', () => {
    expect(shouldSeedMessages(0, serverMessages, 'ready', true)).toBe(false);
  });

  it('returns false when chat already has messages', () => {
    expect(shouldSeedMessages(3, serverMessages, 'ready', false)).toBe(false);
  });

  it('returns false when status is streaming', () => {
    expect(shouldSeedMessages(0, serverMessages, 'streaming', false)).toBe(false);
  });

  it('returns false when status is submitted', () => {
    expect(shouldSeedMessages(0, serverMessages, 'submitted', false)).toBe(false);
  });

  it('returns false when no server messages available', () => {
    expect(shouldSeedMessages(0, [], 'ready', false)).toBe(false);
  });

  it('returns true when status is error but conditions met', () => {
    expect(shouldSeedMessages(0, serverMessages, 'error', false)).toBe(true);
  });

  it('returns false when multiple disqualifying conditions apply', () => {
    // Already seeded AND streaming
    expect(shouldSeedMessages(0, serverMessages, 'streaming', true)).toBe(false);
  });
});
