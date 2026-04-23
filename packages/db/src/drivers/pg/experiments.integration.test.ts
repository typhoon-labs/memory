import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleExperimentsStorage } from './experiments';
import { createTestConnection } from './test-utils';

describe('DrizzleExperimentsStorage (integration)', () => {
  const { db, sql } = createTestConnection();
  let storage: DrizzleExperimentsStorage;

  beforeAll(() => {
    // connection set up at module level
    storage = new DrizzleExperimentsStorage(db);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('createExperiment and getExperimentById', async () => {
    const exp = await storage.createExperiment({
      name: 'test-exp',
      targetType: 'agent',
      targetId: 'agent-1',
      totalItems: 10,
    });
    expect(exp).toBeDefined();

    const fetched = await storage.getExperimentById({ id: (exp as Record<string, string>).id });
    expect(fetched).not.toBeNull();
  });

  it('updateExperiment', async () => {
    const exp = await storage.createExperiment({
      name: 'upd-exp',
      targetType: 'agent',
      targetId: 'agent-1',
      totalItems: 5,
    });
    const id = (exp as Record<string, string>).id;

    const updated = await storage.updateExperiment({ id, status: 'running' });
    expect((updated as Record<string, string>).status).toBe('running');
  });

  it('deleteExperiment cascades results', async () => {
    const exp = await storage.createExperiment({
      name: 'del-exp',
      targetType: 'agent',
      targetId: 'agent-1',
      totalItems: 1,
    });
    const expId = (exp as Record<string, string>).id;

    await storage.addExperimentResult({
      experimentId: expId,
      itemId: 'item-1',
      input: {},
      startedAt: new Date(),
      completedAt: new Date(),
      retryCount: 0,
    });

    await storage.deleteExperiment({ id: expId });
    expect(await storage.getExperimentById({ id: expId })).toBeNull();
  });

  it('listExperiments', async () => {
    await storage.createExperiment({ name: 'e1', targetType: 'agent', targetId: 'a1', totalItems: 1 });
    await storage.createExperiment({ name: 'e2', targetType: 'agent', targetId: 'a2', totalItems: 2 });

    const result = await storage.listExperiments({ page: 0, perPage: 10 });
    expect((result as Record<string, unknown[]>).experiments.length).toBe(2);
  });

  it('addExperimentResult and listExperimentResults', async () => {
    const exp = await storage.createExperiment({
      name: 'res-exp',
      targetType: 'agent',
      targetId: 'a1',
      totalItems: 1,
    });
    const expId = (exp as Record<string, string>).id;

    await storage.addExperimentResult({
      experimentId: expId,
      itemId: 'item-1',
      input: { question: 'hi' },
      output: { answer: 'hello' },
      startedAt: new Date(),
      completedAt: new Date(),
      retryCount: 0,
    });

    const results = await storage.listExperimentResults({
      experimentId: expId,
      page: 0,
      perPage: 10,
    });
    expect((results as Record<string, unknown[]>).results.length).toBe(1);
  });
});
