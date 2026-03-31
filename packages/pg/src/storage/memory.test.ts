import { createDb, type Db } from '@typhoon/db';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleMemoryStorage } from './memory.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('DrizzleMemoryStorage (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: Db;
  let storage: DrizzleMemoryStorage;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);
    db = createDb(sql);
    storage = new DrizzleMemoryStorage({ db });
    await storage.init();
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await sql.end();
  });

  describe('threads', () => {
    it('saveThread and getThreadById', async () => {
      const threadId = crypto.randomUUID();
      const userId = crypto.randomUUID();

      const thread = await storage.saveThread({
        thread: {
          id: threadId,
          resourceId: userId,
          title: 'Test Thread',
          metadata: { key: 'value' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(thread.id).toBe(threadId);
      expect(thread.title).toBe('Test Thread');

      const fetched = await storage.getThreadById({ threadId });
      expect(fetched).not.toBeNull();
      expect(fetched?.resourceId).toBe(userId);
    });

    it('getThreadById returns null for non-existent', async () => {
      const result = await storage.getThreadById({ threadId: crypto.randomUUID() });
      expect(result).toBeNull();
    });

    it('updateThread', async () => {
      const threadId = crypto.randomUUID();
      const userId = crypto.randomUUID();

      await storage.saveThread({
        thread: {
          id: threadId,
          resourceId: userId,
          title: 'Original',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const updated = await storage.updateThread({
        id: threadId,
        title: 'Updated',
        metadata: { updated: true },
      });
      expect(updated.title).toBe('Updated');
    });

    it('deleteThread cascades messages', async () => {
      const threadId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const msgId = crypto.randomUUID();

      await storage.saveThread({
        thread: {
          id: threadId,
          resourceId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await storage.saveMessages({
        messages: [
          {
            id: msgId,
            threadId,
            role: 'user',
            type: 'text',
            content: { format: 2, parts: [] } as never,
            createdAt: new Date(),
          },
        ],
      });

      await storage.deleteThread({ threadId });
      const fetched = await storage.getThreadById({ threadId });
      expect(fetched).toBeNull();

      const { messages } = await storage.listMessagesById({ messageIds: [msgId] });
      expect(messages).toHaveLength(0);
    });

    it('listThreads with resourceId filter', async () => {
      const threadA = crypto.randomUUID();
      const threadB = crypto.randomUUID();
      const user1 = crypto.randomUUID();
      const user2 = crypto.randomUUID();

      await storage.saveThread({
        thread: { id: threadA, resourceId: user1, createdAt: new Date(), updatedAt: new Date() },
      });
      await storage.saveThread({
        thread: { id: threadB, resourceId: user2, createdAt: new Date(), updatedAt: new Date() },
      });

      const result = await storage.listThreads({ filter: { resourceId: user1 } });
      expect(result.threads.length).toBe(1);
      expect(result.threads[0]?.id).toBe(threadA);
    });

    it('listThreads with pagination', async () => {
      const userId = crypto.randomUUID();
      for (let i = 0; i < 5; i++) {
        await storage.saveThread({
          thread: {
            id: crypto.randomUUID(),
            resourceId: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      const page0 = await storage.listThreads({ perPage: 2, page: 0 });
      expect(page0.threads.length).toBe(2);
      expect(page0.total).toBe(5);
      expect(page0.hasMore).toBe(true);

      const page2 = await storage.listThreads({ perPage: 2, page: 2 });
      expect(page2.threads.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('messages', () => {
    let threadMsgId: string;
    let userId: string;

    beforeEach(async () => {
      await storage.dangerouslyClearAll();
      threadMsgId = crypto.randomUUID();
      userId = crypto.randomUUID();
      await storage.saveThread({
        thread: { id: threadMsgId, resourceId: userId, createdAt: new Date(), updatedAt: new Date() },
      });
    });

    it('saveMessages and listMessages', async () => {
      const m1 = crypto.randomUUID();
      const m2 = crypto.randomUUID();

      await storage.saveMessages({
        messages: [
          {
            id: m1,
            threadId: threadMsgId,
            role: 'user',
            type: 'text',
            content: { format: 2, parts: [{ type: 'text', text: 'hello' }] } as never,
            createdAt: new Date(),
          },
          {
            id: m2,
            threadId: threadMsgId,
            role: 'assistant',
            type: 'text',
            content: { format: 2, parts: [{ type: 'text', text: 'hi' }] } as never,
            createdAt: new Date(),
          },
        ],
      });

      const result = await storage.listMessages({ threadId: threadMsgId });
      expect(result.messages.length).toBe(2);
    });

    it('listMessagesById', async () => {
      const mA = crypto.randomUUID();
      const mB = crypto.randomUUID();

      await storage.saveMessages({
        messages: [
          {
            id: mA,
            threadId: threadMsgId,
            role: 'user',
            type: 'text',
            content: { format: 2, parts: [] } as never,
            createdAt: new Date(),
          },
          {
            id: mB,
            threadId: threadMsgId,
            role: 'user',
            type: 'text',
            content: { format: 2, parts: [] } as never,
            createdAt: new Date(),
          },
        ],
      });

      const result = await storage.listMessagesById({ messageIds: [mA] });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0]?.id).toBe(mA);
    });

    it('deleteMessages', async () => {
      const mDel = crypto.randomUUID();

      await storage.saveMessages({
        messages: [
          {
            id: mDel,
            threadId: threadMsgId,
            role: 'user',
            type: 'text',
            content: { format: 2, parts: [] } as never,
            createdAt: new Date(),
          },
        ],
      });

      await storage.deleteMessages([mDel]);
      const result = await storage.listMessagesById({ messageIds: [mDel] });
      expect(result.messages.length).toBe(0);
    });
  });

  describe('resources', () => {
    it('saveResource and getResourceById', async () => {
      const resId = crypto.randomUUID();

      const resource = await storage.saveResource({
        resource: {
          id: resId,
          workingMemory: 'some memory',
          metadata: { key: 'value' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(resource.id).toBe(resId);
      expect(resource.workingMemory).toBe('some memory');

      const fetched = await storage.getResourceById({ resourceId: resId });
      expect(fetched).not.toBeNull();
      expect(fetched?.workingMemory).toBe('some memory');
    });

    it('getResourceById returns null for non-existent', async () => {
      const result = await storage.getResourceById({ resourceId: crypto.randomUUID() });
      expect(result).toBeNull();
    });

    it('updateResource updates workingMemory', async () => {
      const resId = crypto.randomUUID();

      await storage.saveResource({
        resource: { id: resId, workingMemory: 'old', createdAt: new Date(), updatedAt: new Date() },
      });

      const updated = await storage.updateResource({
        resourceId: resId,
        workingMemory: 'new memory',
      });
      expect(updated.workingMemory).toBe('new memory');
    });

    it('updateResource creates if not exists', async () => {
      const resId = crypto.randomUUID();

      const resource = await storage.updateResource({
        resourceId: resId,
        workingMemory: 'auto-created',
      });
      expect(resource.id).toBe(resId);
      expect(resource.workingMemory).toBe('auto-created');
    });
  });

  describe('dangerouslyClearAll', () => {
    it('removes all data', async () => {
      const threadId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const resId = crypto.randomUUID();

      await storage.saveThread({
        thread: { id: threadId, resourceId: userId, createdAt: new Date(), updatedAt: new Date() },
      });
      await storage.saveResource({
        resource: { id: resId, createdAt: new Date(), updatedAt: new Date() },
      });

      await storage.dangerouslyClearAll();

      const thread = await storage.getThreadById({ threadId });
      expect(thread).toBeNull();

      const resource = await storage.getResourceById({ resourceId: resId });
      expect(resource).toBeNull();
    });
  });
});
