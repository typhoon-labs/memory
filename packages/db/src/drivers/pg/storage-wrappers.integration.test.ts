/**
 * Integration tests for Mastra storage wrapper classes.
 * These verify that the input-mapping logic in each wrapper correctly
 * translates Mastra-shaped input into versioned driver calls.
 *
 * The underlying createVersionedDriver is thoroughly tested in
 * versioned.integration.test.ts — these tests only validate the
 * wrapper-specific input unwrapping.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleAgentsStorage } from './agents';
import { DrizzleMCPServersStorage } from './mcp-servers';
import { DrizzlePromptBlocksStorage } from './prompt-blocks';
import { DrizzleSkillsStorage } from './skills';
import { createTestConnection } from './test-utils';

describe('Storage wrapper round-trips (integration)', () => {
  const { db, sql } = createTestConnection();

  afterAll(async () => {
    await sql.end();
  });

  // ── Agents ──────────────────────────────────────────────────────────────

  describe('DrizzleAgentsStorage', () => {
    const storage = new DrizzleAgentsStorage(db);

    beforeEach(async () => {
      await storage.dangerouslyClearAll();
    });

    it('create + getById round-trip with Mastra-shaped input', async () => {
      const id = crypto.randomUUID();
      const result = (await storage.create({
        agent: { id, status: 'draft', metadata: { name: 'Test Agent' } },
      } as never)) as any;

      expect(result.id).toBe(id);

      const fetched = (await storage.getById(id)) as any;
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(id);
    });

    it('list returns created entities', async () => {
      await storage.create({ agent: { id: crypto.randomUUID(), status: 'draft' } } as never);
      await storage.create({ agent: { id: crypto.randomUUID(), status: 'active' } } as never);

      const result = (await storage.list()) as any;
      expect(result.rows.length).toBe(2);
    });

    it('dangerouslyClearAll empties the table', async () => {
      await storage.create({ agent: { id: crypto.randomUUID(), status: 'draft' } } as never);
      await storage.dangerouslyClearAll();

      const result = (await storage.list()) as any;
      expect(result.rows.length).toBe(0);
    });

    it('update modifies status', async () => {
      const id = crypto.randomUUID();
      await storage.create({ agent: { id, status: 'draft' } } as never);

      const updated = (await storage.update({ id, status: 'active' } as never)) as any;
      expect(updated.status).toBe('active');
    });
  });

  // ── Skills ──────────────────────────────────────────────────────────────

  describe('DrizzleSkillsStorage', () => {
    const storage = new DrizzleSkillsStorage(db);

    beforeEach(async () => {
      await storage.dangerouslyClearAll();
    });

    it('create + getById with skill wrapper shape', async () => {
      const id = crypto.randomUUID();
      const result = (await storage.create({
        skill: { id, status: 'draft' },
      } as never)) as any;

      expect(result.id).toBe(id);

      const fetched = (await storage.getById(id)) as any;
      expect(fetched).not.toBeNull();
    });

    it('create without skill wrapper (flat input)', async () => {
      const id = crypto.randomUUID();
      const result = (await storage.create({ id, status: 'active' } as never)) as any;
      expect(result.id).toBe(id);
    });

    it('authorId defaults to null for skills', async () => {
      const id = crypto.randomUUID();
      await storage.create({ skill: { id, status: 'draft' } } as never);
      const fetched = (await storage.getById(id)) as any;
      expect(fetched?.authorId).toBeNull();
    });
  });

  // ── MCP Servers ─────────────────────────────────────────────────────────

  describe('DrizzleMCPServersStorage', () => {
    const storage = new DrizzleMCPServersStorage(db);

    beforeEach(async () => {
      await storage.dangerouslyClearAll();
    });

    it('create + getById with mcpServer wrapper shape', async () => {
      const id = crypto.randomUUID();
      const result = await storage.create({
        mcpServer: { id, status: 'active' },
      } as never);

      expect((result as any).id).toBe(id);
      const fetched = await storage.getById(id);
      expect(fetched).not.toBeNull();
    });

    it('delete removes entity', async () => {
      const id = crypto.randomUUID();
      await storage.create({ mcpServer: { id, status: 'active' } } as never);

      await storage.delete(id);
      const fetched = await storage.getById(id);
      expect(fetched).toBeNull();
    });
  });

  // ── Prompt Blocks ───────────────────────────────────────────────────────

  describe('DrizzlePromptBlocksStorage', () => {
    const storage = new DrizzlePromptBlocksStorage(db);

    beforeEach(async () => {
      await storage.dangerouslyClearAll();
    });

    it('create + getById with promptBlock wrapper shape', async () => {
      const id = crypto.randomUUID();
      const result = await storage.create({
        promptBlock: { id, status: 'draft', metadata: { type: 'system' } },
      } as never);

      expect((result as any).id).toBe(id);
      const fetched = await storage.getById(id);
      expect(fetched).not.toBeNull();
    });

    it('update modifies fields', async () => {
      const id = crypto.randomUUID();
      await storage.create({ promptBlock: { id, status: 'draft' } } as never);

      const updated = (await storage.update({ id, status: 'active' } as never)) as any;
      expect(updated.status).toBe('active');
    });

    it('delete removes entity', async () => {
      const id = crypto.randomUUID();
      await storage.create({ promptBlock: { id, status: 'draft' } } as never);

      await storage.delete(id);
      const fetched = await storage.getById(id);
      expect(fetched).toBeNull();
    });
  });
});
