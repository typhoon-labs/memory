import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestConnection } from './test-utils';
import { DrizzleWorkflowsStorage } from './workflows';

describe('DrizzleWorkflowsStorage (integration)', () => {
  const { db, sql } = createTestConnection();

  let storage: DrizzleWorkflowsStorage;

  beforeAll(() => {
    // connection set up at module level

    storage = new DrizzleWorkflowsStorage(db);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('persistWorkflowSnapshot and loadWorkflowSnapshot', async () => {
    const snapshot = { runId: 'run-1', status: 'running', value: {}, context: {} };
    await storage.persistWorkflowSnapshot({
      workflowName: 'my-workflow',
      runId: 'run-1',
      snapshot: snapshot as never,
    });

    const loaded = await storage.loadWorkflowSnapshot({ workflowName: 'my-workflow', runId: 'run-1' });
    expect(loaded).not.toBeNull();
    expect((loaded as Record<string, unknown>).runId).toBe('run-1');
  });

  it('loadWorkflowSnapshot returns null for non-existent', async () => {
    const result = await storage.loadWorkflowSnapshot({ workflowName: 'nope', runId: 'nope' });
    expect(result).toBeNull();
  });

  it('persistWorkflowSnapshot upserts on conflict', async () => {
    await storage.persistWorkflowSnapshot({
      workflowName: 'wf',
      runId: 'r1',
      snapshot: { status: 'running' } as never,
    });
    await storage.persistWorkflowSnapshot({
      workflowName: 'wf',
      runId: 'r1',
      snapshot: { status: 'completed' } as never,
    });

    const loaded = await storage.loadWorkflowSnapshot({ workflowName: 'wf', runId: 'r1' });
    expect((loaded as Record<string, unknown>).status).toBe('completed');
  });

  it('getWorkflowRunById', async () => {
    await storage.persistWorkflowSnapshot({
      workflowName: 'wf',
      runId: 'r2',
      snapshot: { value: 42 } as never,
    });

    const run = await storage.getWorkflowRunById({ runId: 'r2' });
    expect(run).not.toBeNull();
  });

  it('deleteWorkflowRunById', async () => {
    await storage.persistWorkflowSnapshot({
      workflowName: 'wf',
      runId: 'r3',
      snapshot: {} as never,
    });

    await storage.deleteWorkflowRunById({ runId: 'r3', workflowName: 'wf' });
    const result = await storage.loadWorkflowSnapshot({ workflowName: 'wf', runId: 'r3' });
    expect(result).toBeNull();
  });

  it('listWorkflowRuns', async () => {
    for (let i = 0; i < 3; i++) {
      // oxlint-disable-next-line no-await-in-loop -- test setup: sequential DB seeding
      await storage.persistWorkflowSnapshot({
        workflowName: 'wf',
        runId: `run-${i}`,
        snapshot: {} as never,
      });
    }

    const result = (await storage.listWorkflowRuns({ workflowName: 'wf' })) as {
      runs: unknown[];
      total: number;
    };
    expect(result.runs.length).toBe(3);
    expect(result.total).toBe(3);
  });
});
