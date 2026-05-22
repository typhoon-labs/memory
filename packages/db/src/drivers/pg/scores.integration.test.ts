import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleScoresStorage } from './scores';
import { createTestConnection } from './test-utils';

describe('DrizzleScoresStorage (integration)', () => {
  const { db, sql } = createTestConnection();
  let storage: DrizzleScoresStorage;

  beforeAll(() => {
    // connection set up at module level
    storage = new DrizzleScoresStorage(db);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('saveScore and getScoreById', async () => {
    const scoreId = crypto.randomUUID();

    const result = await storage.saveScore({
      id: scoreId,
      scorerId: 'scorer-1',
      entityId: 'entity-1',
      runId: 'run-1',
      score: 0.95,
      source: 'LIVE',
      input: { text: 'hello' },
      output: { text: 'world' },
      scorer: { name: 'test-scorer' },
      entity: { type: 'agent', name: 'test' },
    } as never);
    expect(result).toBeDefined();

    const fetched = await storage.getScoreById({ id: scoreId });
    expect(fetched).not.toBeNull();
  });

  it('listScoresByScorerId', async () => {
    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();
    const s3 = crypto.randomUUID();

    await storage.saveScore({
      id: s1,
      scorerId: 'sc-A',
      entityId: 'e-1',
      runId: 'r-1',
      score: 0.8,
      source: 'LIVE',
      input: {},
      output: {},
      scorer: {},
      entity: {},
    } as never);
    await storage.saveScore({
      id: s2,
      scorerId: 'sc-A',
      entityId: 'e-2',
      runId: 'r-2',
      score: 0.9,
      source: 'TEST',
      input: {},
      output: {},
      scorer: {},
      entity: {},
    } as never);
    await storage.saveScore({
      id: s3,
      scorerId: 'sc-B',
      entityId: 'e-3',
      runId: 'r-3',
      score: 0.7,
      source: 'LIVE',
      input: {},
      output: {},
      scorer: {},
      entity: {},
    } as never);

    const result = (await storage.listScoresByScorerId({
      scorerId: 'sc-A',
      pagination: { page: 0, perPage: 10 },
    })) as { scores: unknown[] };
    expect(result.scores.length).toBe(2);
  });

  it('listScoresByRunId', async () => {
    const srId = crypto.randomUUID();

    await storage.saveScore({
      id: srId,
      scorerId: 'sc-1',
      entityId: 'e-1',
      runId: 'target-run',
      score: 0.5,
      source: 'LIVE',
      input: {},
      output: {},
      scorer: {},
      entity: {},
    } as never);

    const result = (await storage.listScoresByRunId({
      runId: 'target-run',
      pagination: { page: 0, perPage: 10 },
    })) as { scores: unknown[] };
    expect(result.scores.length).toBe(1);
  });
});
