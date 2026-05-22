import { Cluster, Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInstances } = vi.hoisted(() => {
  const mockInstances: Array<{ type: string; name?: string; opts: Record<string, unknown> }> = [];
  return { mockInstances };
});

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name: string;
    constructor(name: string, opts: Record<string, unknown>) {
      this.name = name;
      mockInstances.push({ type: 'Queue', name, opts });
    }
  },
  Worker: class MockWorker {
    name: string;
    constructor(name: string, _processor: unknown, opts: Record<string, unknown>) {
      this.name = name;
      mockInstances.push({ type: 'Worker', name, opts });
    }
  },
  QueueEvents: class MockQueueEvents {
    name: string;
    constructor(name: string, opts: Record<string, unknown>) {
      this.name = name;
      mockInstances.push({ type: 'QueueEvents', name, opts });
    }
  },
  FlowProducer: class MockFlowProducer {
    constructor(opts: Record<string, unknown>) {
      mockInstances.push({ type: 'FlowProducer', opts });
    }
  },
}));

import { RedisProvider } from './redis-provider';

describe('RedisProvider', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  describe('config resolution', () => {
    it('reads REDIS_URL from env', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://myhost:7000' });
      expect(provider.config.url).toBe('redis://myhost:7000');
    });

    it('defaults to redis://localhost:6379 when REDIS_URL is not set', () => {
      const provider = new RedisProvider({});
      expect(provider.config.url).toBe('redis://localhost:6379');
    });

    it('reads REDIS_KEY_PREFIX from env', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_KEY_PREFIX: 'myapp' });
      expect(provider.config.prefix).toBe('myapp');
    });

    it('defaults prefix to "typhoon"', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379' });
      expect(provider.config.prefix).toBe('typhoon');
    });

    it('reads REDIS_CLUSTER=true from env', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_CLUSTER: 'true' });
      expect(provider.config.cluster).toBe(true);
    });

    it('defaults cluster to false', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379' });
      expect(provider.config.cluster).toBe(false);
    });
  });

  describe('createQueue', () => {
    it('creates a Queue with the configured prefix', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_KEY_PREFIX: 'test' });
      provider.createQueue('sync', { attempts: 3 });

      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].type).toBe('Queue');
      expect(mockInstances[0].name).toBe('sync');
      expect(mockInstances[0].opts.prefix).toBe('test');
      expect(mockInstances[0].opts.defaultJobOptions).toEqual({ attempts: 3 });
    });
  });

  describe('createWorker', () => {
    it('creates a Worker with the configured prefix and user opts', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_KEY_PREFIX: 'test' });
      provider.createWorker('sync', async () => {}, { concurrency: 5 });

      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].type).toBe('Worker');
      expect(mockInstances[0].name).toBe('sync');
      expect(mockInstances[0].opts.prefix).toBe('test');
      expect(mockInstances[0].opts.concurrency).toBe(5);
    });
  });

  describe('createQueueEvents', () => {
    it('creates QueueEvents with the configured prefix', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_KEY_PREFIX: 'test' });
      provider.createQueueEvents('sync');

      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].type).toBe('QueueEvents');
      expect(mockInstances[0].name).toBe('sync');
      expect(mockInstances[0].opts.prefix).toBe('test');
    });
  });

  describe('createFlowProducer', () => {
    it('creates FlowProducer with the configured prefix', () => {
      const provider = new RedisProvider({ REDIS_URL: 'redis://localhost:6379', REDIS_KEY_PREFIX: 'test' });
      provider.createFlowProducer();

      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].type).toBe('FlowProducer');
      expect(mockInstances[0].opts.prefix).toBe('test');
    });
  });

  describe('createClient (standalone)', () => {
    it('returns an ioredis Redis instance with keyPrefix', () => {
      const provider = new RedisProvider({
        REDIS_URL: 'redis://localhost:6379',
        REDIS_KEY_PREFIX: 'test',
      });
      const client = provider.createClient();
      expect(client).toBeInstanceOf(Redis);
      expect(client.options.keyPrefix).toBe('test:');
    });
  });

  describe('createClient (cluster)', () => {
    it('returns an ioredis Cluster instance with keyPrefix', () => {
      const provider = new RedisProvider({
        REDIS_URL: 'redis://cluster-endpoint:6379',
        REDIS_CLUSTER: 'true',
        REDIS_KEY_PREFIX: 'test',
      });
      const client = provider.createClient();
      expect(client).toBeInstanceOf(Cluster);
      expect(client.options.keyPrefix).toBe('test:');
    });
  });
});
