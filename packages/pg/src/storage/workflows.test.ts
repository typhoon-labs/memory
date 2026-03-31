import { createDb, type Db } from '@typhoon/db';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleWorkflowsStorage } from './workflows.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('DrizzleWorkflowsStorage (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: Db;
  let storage: DrizzleWorkflowsStorage;

  beforeAll(() => {
    sql = postgres(TEST_DB_URL);
    db = createDb(sql);
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
      await storage.persistWorkflowSnapshot({
        workflowName: 'wf',
        runId: `run-${i}`,
        snapshot: {} as never,
      });
    }

    const result = await storage.listWorkflowRuns({ workflowName: 'wf' });
    expect(result.runs.length).toBe(3);
    expect(result.total).toBe(3);
  });
});
