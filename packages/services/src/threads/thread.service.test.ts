import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import { isSystemReminder, normalizeToolPart, ThreadService, toThreadResponse, toUIMessage } from './thread.service';

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('normalizeToolPart', () => {
  it('converts v4 tool-invocation with result to v6 output-available format', () => {
    const part = {
      type: 'tool-invocation',
      toolInvocation: {
        state: 'result',
        toolCallId: 'call-1',
        toolName: 'searchKnowledge',
        args: { query: 'pto' },
        result: { text: 'PTO is 20 days' },
      },
    };

    expect(normalizeToolPart(part)).toEqual({
      type: 'tool-searchKnowledge',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'pto' },
      output: { text: 'PTO is 20 days' },
    });
  });

  it('converts v4 tool-invocation with state "call" to output-error', () => {
    const part = {
      type: 'tool-invocation',
      toolInvocation: {
        state: 'call',
        toolCallId: 'call-2',
        toolName: 'lookup',
        args: { id: 42 },
      },
    };

    expect(normalizeToolPart(part)).toEqual({
      type: 'tool-lookup',
      toolCallId: 'call-2',
      state: 'output-error',
      input: { id: 42 },
    });
  });

  it('detects Bun serialization error and maps to output-error', () => {
    const part = {
      type: 'tool-invocation',
      toolInvocation: {
        state: 'result',
        toolCallId: 'call-4',
        toolName: 'searchKnowledge',
        args: { prompt: 'test' },
        result: 'JSON.stringify cannot serialize cyclic structures.',
      },
    };

    expect(normalizeToolPart(part)).toEqual({
      type: 'tool-searchKnowledge',
      toolCallId: 'call-4',
      state: 'output-error',
      input: { prompt: 'test' },
    });
  });

  it('detects Node serialization error and maps to output-error', () => {
    const part = {
      type: 'tool-invocation',
      toolInvocation: {
        state: 'result',
        toolCallId: 'call-5',
        toolName: 'lookup',
        args: {},
        result: 'Converting circular structure to JSON -- TypeError',
      },
    };

    expect(normalizeToolPart(part)).toMatchObject({ state: 'output-error' });
  });

  it('uses "unknown" when toolName is missing', () => {
    const part = {
      type: 'tool-invocation',
      toolInvocation: { state: 'call', toolCallId: 'call-3', args: {} },
    };

    expect(normalizeToolPart(part)).toMatchObject({ type: 'tool-unknown' });
  });

  it('passes through non-tool-invocation parts unchanged', () => {
    const textPart = { type: 'text', text: 'hello' };
    expect(normalizeToolPart(textPart)).toEqual(textPart);
  });

  it('passes through non-object parts unchanged', () => {
    expect(normalizeToolPart('just a string')).toBe('just a string');
    expect(normalizeToolPart(null)).toBe(null);
    expect(normalizeToolPart(42)).toBe(42);
  });
});

describe('isSystemReminder', () => {
  it('returns true for system reminder messages', () => {
    const msg = {
      content: {
        metadata: { systemReminder: { type: 'anthropic-prefill-processor-retry' } },
      },
    };
    expect(isSystemReminder(msg)).toBe(true);
  });

  it('returns false for normal messages', () => {
    const msg = { content: { content: 'Hello' } };
    expect(isSystemReminder(msg)).toBe(false);
  });

  it('returns false when metadata is absent', () => {
    const msg = { content: {} };
    expect(isSystemReminder(msg)).toBe(false);
  });
});

describe('toUIMessage', () => {
  const now = new Date('2026-01-15T10:00:00Z');

  it('uses parts when present', () => {
    const msg = {
      externalId: 'msg-1',
      role: 'assistant',
      content: { parts: [{ type: 'text', text: 'Hello' }] },
      createdAt: now,
    };

    expect(toUIMessage(msg)).toEqual({
      id: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
      createdAt: now,
    });
  });

  it('falls back to content.content when parts are missing', () => {
    const msg = {
      externalId: 'msg-1',
      role: 'assistant',
      content: { content: 'Hello from AI' },
      createdAt: now,
    };

    expect(toUIMessage(msg)).toMatchObject({
      id: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello from AI' }],
    });
  });

  it('falls back to empty text when both parts and content.content are absent', () => {
    const msg = {
      externalId: 'msg-1',
      role: 'user',
      content: {},
      createdAt: now,
    };

    expect(toUIMessage(msg).parts).toEqual([{ type: 'text', text: '' }]);
  });
});

describe('toThreadResponse', () => {
  it('exposes externalId as id and omits internal id', () => {
    const row = {
      externalId: 'ext-abc',
      resourceId: 'user-1',
      title: 'Chat',
      metadata: { k: 'v' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const resp = toThreadResponse(row);
    expect(resp.id).toBe('ext-abc');
    expect(resp).not.toHaveProperty('externalId');
    expect(resp.resourceId).toBe('user-1');
    expect(resp.title).toBe('Chat');
    expect(resp.metadata).toEqual({ k: 'v' });
  });
});

// ---------------------------------------------------------------------------
// ThreadService tests
// ---------------------------------------------------------------------------

describe('ThreadService', () => {
  const now = new Date('2026-01-15T10:00:00Z');

  function makeThreadRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'internal-uuid-1',
      externalId: 'ext-thread-1',
      resourceId: 'user-1',
      title: 'My Chat',
      metadata: { key: 'value' },
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function makeMessageRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-internal-1',
      externalId: 'msg-ext-1',
      threadId: 'internal-uuid-1',
      role: 'user',
      type: 'text',
      content: { content: 'Hello there' },
      createdAt: now,
      ...overrides,
    };
  }

  let service: ThreadService;
  let mockThreadRepo: {
    findByExternalId: ReturnType<typeof vi.fn>;
    findFullByExternalId: ReturnType<typeof vi.fn>;
    listByResourceId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockMessageRepo: {
    findByExternalId: ReturnType<typeof vi.fn>;
    listByThreadId: ReturnType<typeof vi.fn>;
    deleteByThreadId: ReturnType<typeof vi.fn>;
  };
  let mockVectorStore: {
    getChunksByIds: ReturnType<typeof vi.fn>;
    getSyncTargetNames: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadRepo = {
      findByExternalId: vi.fn(),
      findFullByExternalId: vi.fn(),
      listByResourceId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mockMessageRepo = {
      findByExternalId: vi.fn(),
      listByThreadId: vi.fn(),
      deleteByThreadId: vi.fn(),
    };
    mockVectorStore = {
      getChunksByIds: vi.fn().mockResolvedValue([]),
      getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
    };
    service = new ThreadService({
      threadRepo: mockThreadRepo as never,
      messageRepo: mockMessageRepo as never,
      vectorStore: mockVectorStore as never,
    });
  });

  describe('listThreads', () => {
    it('returns paginated threads', async () => {
      const rows = [makeThreadRow(), makeThreadRow({ externalId: 'ext-thread-2' })];
      mockThreadRepo.listByResourceId.mockResolvedValueOnce({ rows, total: 2 });

      const result = await service.listThreads({ userId: 'user-1', page: 0, perPage: 20 });

      const data = assertOk(result);
      expect(data.threads).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.hasMore).toBe(false);
    });

    it('computes hasMore correctly', async () => {
      mockThreadRepo.listByResourceId.mockResolvedValueOnce({
        rows: [makeThreadRow()],
        total: 50,
      });

      const result = await service.listThreads({ userId: 'user-1', page: 1, perPage: 10 });

      const data = assertOk(result);
      expect(data.hasMore).toBe(true);
    });
  });

  describe('getThread', () => {
    it('returns thread with messages', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow();
      mockThreadRepo.findFullByExternalId.mockResolvedValueOnce(thread);
      mockMessageRepo.listByThreadId.mockResolvedValueOnce([msg]);

      const result = await service.getThread({ threadId: 'ext-thread-1', userId: 'user-1' });

      const data = assertOk(result);
      expect(data.id).toBe('ext-thread-1');
      expect(data.messages).toHaveLength(1);
    });

    it('returns error when thread not found', async () => {
      mockThreadRepo.findFullByExternalId.mockResolvedValueOnce(null);

      const result = await service.getThread({ threadId: 'nonexistent', userId: 'user-1' });

      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('filters out system reminder messages', async () => {
      const thread = makeThreadRow();
      const userMsg = makeMessageRow({ externalId: 'msg-user', role: 'user', content: { content: 'Hello' } });
      const reminderMsg = makeMessageRow({
        externalId: 'msg-reminder',
        role: 'user',
        content: {
          parts: [{ text: '<system-reminder>continue</system-reminder>', type: 'text' }],
          format: 2,
          metadata: { systemReminder: { type: 'anthropic-prefill-processor-retry' } },
        },
      });
      const assistantMsg = makeMessageRow({
        externalId: 'msg-asst',
        role: 'assistant',
        content: { content: 'Hi there!' },
      });

      mockThreadRepo.findFullByExternalId.mockResolvedValueOnce(thread);
      mockMessageRepo.listByThreadId.mockResolvedValueOnce([userMsg, reminderMsg, assistantMsg]);

      const result = await service.getThread({ threadId: 'ext-thread-1', userId: 'user-1' });

      const data = assertOk(result);
      expect(data.messages).toHaveLength(2);
      expect(data.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    });
  });

  describe('createThread', () => {
    it('creates and returns thread', async () => {
      const created = makeThreadRow({ title: 'New Chat' });
      mockThreadRepo.create.mockResolvedValueOnce(created);

      const result = await service.createThread({
        userId: 'user-1',
        title: 'New Chat',
        metadata: {},
      });

      const data = assertOk(result);
      expect(data.id).toBe('ext-thread-1');
      expect(data.title).toBe('New Chat');
    });
  });

  describe('updateThread', () => {
    it('updates and returns thread', async () => {
      const updated = makeThreadRow({ title: 'Updated' });
      mockThreadRepo.update.mockResolvedValueOnce(updated);

      const result = await service.updateThread({
        threadId: 'ext-thread-1',
        userId: 'user-1',
        title: 'Updated',
      });

      const data = assertOk(result);
      expect(data.title).toBe('Updated');
    });

    it('returns error when thread not found', async () => {
      mockThreadRepo.update.mockResolvedValueOnce(null);

      const result = await service.updateThread({
        threadId: 'nonexistent',
        userId: 'user-1',
        title: 'X',
      });

      expect('error' in result).toBe(true);
    });
  });

  describe('deleteThread', () => {
    it('deletes thread and its messages', async () => {
      const thread = makeThreadRow();
      mockThreadRepo.findFullByExternalId.mockResolvedValueOnce(thread);
      mockMessageRepo.deleteByThreadId.mockResolvedValueOnce(undefined);
      mockThreadRepo.delete.mockResolvedValueOnce(undefined);

      const result = await service.deleteThread({ threadId: 'ext-thread-1', userId: 'user-1' });

      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(mockMessageRepo.deleteByThreadId).toHaveBeenCalledWith('internal-uuid-1');
      expect(mockThreadRepo.delete).toHaveBeenCalledWith('internal-uuid-1');
    });

    it('returns error when thread not found', async () => {
      mockThreadRepo.findFullByExternalId.mockResolvedValueOnce(null);

      const result = await service.deleteThread({ threadId: 'nonexistent', userId: 'user-1' });

      expect('error' in result).toBe(true);
      expect(mockMessageRepo.deleteByThreadId).not.toHaveBeenCalled();
    });
  });
});
