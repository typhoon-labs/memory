import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {
    constructor(public config: unknown) {}
  },
}));

vi.mock('@typhoon/db/repos', () => ({
  MessageRepo: class MockMessageRepo {
    constructor(public db: unknown) {}
  },
  ThreadRepo: class MockThreadRepo {
    constructor(public db: unknown) {}
  },
  ScoreRepo: class MockScoreRepo {
    constructor(public db: unknown) {}
  },
}));

vi.mock('@typhoon/services', () => ({
  ScoringService: class MockScoringService {
    constructor(public deps: unknown) {}
    toScoringDeps() {
      return {};
    }
  },
}));

import { createWorkerServices } from './services';

describe('createWorkerServices', () => {
  it('returns scoringService and vectorStore', () => {
    const mockDb = {} as never;
    const mockSql = {} as never;

    const { scoringService, vectorStore } = createWorkerServices(mockDb, mockSql);

    expect(scoringService).toBeDefined();
    expect(vectorStore).toBeDefined();
  });

  it('passes db and sql to the correct repos', () => {
    const mockDb = { __db: true } as never;
    const mockSql = { __sql: true } as never;

    const { scoringService } = createWorkerServices(mockDb, mockSql);

    // Verify the deps were wired correctly by checking the ScoringService constructor arg
    const deps = (scoringService as unknown as { deps: Record<string, { db?: unknown; sql?: unknown }> }).deps;
    expect(deps.messageRepo.db).toBe(mockDb);
    expect(deps.threadRepo.db).toBe(mockDb);
    expect(deps.scoreRepo.db).toBe(mockDb);
  });
});
