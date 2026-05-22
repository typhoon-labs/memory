import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScoringServiceDeps } from './scoring.service';
import { ScoringService } from './scoring.service';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<ScoringServiceDeps> = {}): ScoringServiceDeps {
  return {
    messageRepo: {
      findByExternalId: vi.fn().mockResolvedValue(null),
      listByThreadId: vi.fn().mockResolvedValue([]),
      deleteByThreadId: vi.fn().mockResolvedValue(undefined),
    } as unknown as ScoringServiceDeps['messageRepo'],
    threadRepo: {
      findByExternalId: vi.fn().mockResolvedValue(null),
    } as unknown as ScoringServiceDeps['threadRepo'],
    scoreRepo: {
      hasExistingScore: vi.fn().mockResolvedValue(false),
      saveScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as ScoringServiceDeps['scoreRepo'],
    vectorStore: {
      getChunksByIds: vi.fn().mockResolvedValue([]),
      getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
    } as unknown as ScoringServiceDeps['vectorStore'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ScoringService', () => {
  let deps: ScoringServiceDeps;
  let service: ScoringService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new ScoringService(deps);
  });

  describe('fetchMessages', () => {
    it('returns null when assistant message is not found', async () => {
      const result = await service.fetchMessages('nonexistent');
      expect(result).toBeNull();
      expect(deps.messageRepo.findByExternalId).toHaveBeenCalledWith('nonexistent');
    });

    it('returns assistant and user message content when found', async () => {
      vi.mocked(deps.messageRepo.findByExternalId).mockResolvedValue({
        id: 'internal-1',
        threadId: 'thread-1',
      });
      vi.mocked(deps.messageRepo.listByThreadId).mockResolvedValue([
        {
          id: 'internal-0',
          externalId: 'user-ext',
          threadId: 'thread-1',
          role: 'user',
          content: { text: 'question' },
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'internal-1',
          externalId: 'assistant-ext',
          threadId: 'thread-1',
          role: 'assistant',
          content: { text: 'answer' },
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ] as never);

      const result = await service.fetchMessages('assistant-ext');
      expect(result).toEqual({
        assistantContent: { text: 'answer' },
        userContent: { text: 'question' },
        messageExternalId: 'assistant-ext',
      });
    });

    it('filters out PrefillErrorHandler retry messages', async () => {
      vi.mocked(deps.messageRepo.findByExternalId).mockResolvedValue({
        id: 'internal-1',
        threadId: 'thread-1',
      });
      vi.mocked(deps.messageRepo.listByThreadId).mockResolvedValue([
        {
          id: 'internal-0',
          externalId: 'user-ext',
          threadId: 'thread-1',
          role: 'user',
          content: { text: 'real question' },
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'internal-retry',
          externalId: 'retry-ext',
          threadId: 'thread-1',
          role: 'user',
          content: { metadata: { systemReminder: true } },
          createdAt: new Date('2024-01-01T00:00:30Z'),
        },
        {
          id: 'internal-1',
          externalId: 'assistant-ext',
          threadId: 'thread-1',
          role: 'assistant',
          content: { text: 'answer' },
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ] as never);

      const result = await service.fetchMessages('assistant-ext');
      expect(result).not.toBeNull();
      expect(result?.userContent).toEqual({ text: 'real question' });
    });
  });

  describe('resolveLatestAssistantMessage', () => {
    it('returns null when thread is not found', async () => {
      const result = await service.resolveLatestAssistantMessage('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the latest assistant message externalId', async () => {
      vi.mocked(deps.threadRepo.findByExternalId).mockResolvedValue({ id: 'thread-internal' });
      vi.mocked(deps.messageRepo.listByThreadId).mockResolvedValue([
        {
          id: 'msg-1',
          externalId: 'asst-ext-1',
          role: 'assistant',
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'msg-2',
          externalId: 'asst-ext-2',
          role: 'assistant',
          createdAt: new Date('2024-01-01T00:01:00Z'),
        },
      ] as never);

      const result = await service.resolveLatestAssistantMessage('thread-ext');
      expect(result).toBe('asst-ext-2');
    });
  });

  describe('hydrateChunks', () => {
    it('returns empty map for empty chunk IDs', async () => {
      const result = await service.hydrateChunks([]);
      expect(result).toEqual(new Map());
      expect(deps.vectorStore.getChunksByIds).not.toHaveBeenCalled();
    });

    it('returns map of chunk ID to metadata', async () => {
      vi.mocked(deps.vectorStore.getChunksByIds).mockResolvedValue([
        { id: 'c1', metadata: { text: 'hello', title: 'Doc A', source: 'a.txt', syncTargetId: 'st-1' } },
        { id: 'c2', metadata: { text: 'world', title: 'Doc B', source: 'b.txt' } },
      ] as never);
      vi.mocked(deps.vectorStore.getSyncTargetNames).mockResolvedValue(new Map([['st-1', 'Support']]));

      const result = await service.hydrateChunks(['c1', 'c2']);
      expect(result.get('c1')).toEqual({
        text: 'hello',
        title: 'Doc A',
        source: 'a.txt',
        section: undefined,
        syncTargetName: 'Support',
      });
      expect(result.get('c2')?.text).toBe('world');
      expect(result.get('c2')?.title).toBe('Doc B');
    });
  });

  describe('hasExistingScore', () => {
    it('delegates to scoreRepo', async () => {
      vi.mocked(deps.scoreRepo.hasExistingScore).mockResolvedValue(true);
      const result = await service.hasExistingScore('entity-1', 'scorer-1');
      expect(result).toBe(true);
      expect(deps.scoreRepo.hasExistingScore).toHaveBeenCalledWith('entity-1', 'scorer-1');
    });
  });

  describe('saveScore', () => {
    it('delegates to scoreRepo', async () => {
      const score = { id: 's1', scorerId: 'test' };
      await service.saveScore(score);
      expect(deps.scoreRepo.saveScore).toHaveBeenCalledWith(score);
    });
  });

  describe('toScoringDeps', () => {
    it('returns an object with all ScoringDeps methods', () => {
      const scoringDeps = service.toScoringDeps();
      expect(typeof scoringDeps.fetchMessages).toBe('function');
      expect(typeof scoringDeps.resolveLatestAssistantMessage).toBe('function');
      expect(typeof scoringDeps.hydrateChunks).toBe('function');
      expect(typeof scoringDeps.hasExistingScore).toBe('function');
      expect(typeof scoringDeps.saveScore).toBe('function');
    });

    it('methods are properly bound and delegate to the service', async () => {
      vi.mocked(deps.scoreRepo.hasExistingScore).mockResolvedValue(true);
      const scoringDeps = service.toScoringDeps();

      // Call the unbound function — it should still work because it's bound
      const { hasExistingScore } = scoringDeps;
      const result = await hasExistingScore('e1', 's1');
      expect(result).toBe(true);
      expect(deps.scoreRepo.hasExistingScore).toHaveBeenCalledWith('e1', 's1');
    });
  });
});
