import { isRedisCluster } from '@typhoon/config';
import type { ConnectionOptions, DefaultJobOptions, Processor, WorkerOptions } from 'bullmq';
import { FlowProducer, Queue, QueueEvents, Worker } from 'bullmq';
import { Cluster, Redis } from 'ioredis';

/** Resolved Redis configuration. */
export interface RedisConfig {
  url: string;
  cluster: boolean;
  prefix: string;
}

/**
 * Centralised Redis configuration and connection factory.
 *
 * All BullMQ queues, workers, and non-BullMQ consumers (e.g. Better Auth)
 * receive a single `RedisProvider` instance instead of threading separate
 * `redisUrl`, `connection`, and `prefix` parameters.
 *
 * - BullMQ consumers use factory methods: `createQueue`, `createWorker`,
 *   `createQueueEvents`, `createFlowProducer`. Connection and prefix are
 *   injected automatically — never construct BullMQ objects directly.
 * - Non-BullMQ consumers call `createClient()` which returns an ioredis
 *   instance with `keyPrefix` already set for transparent key prefixing.
 */
export class RedisProvider {
  readonly config: RedisConfig;

  constructor(env?: Record<string, string | undefined>) {
    const e = env ?? process.env;
    this.config = {
      url: e.REDIS_URL ?? 'redis://localhost:6379',
      cluster: isRedisCluster(e),
      prefix: e.REDIS_KEY_PREFIX ?? 'typhoon',
    };
  }

  /** @internal Key prefix — used by factory methods. */
  private get prefix(): string {
    return this.config.prefix;
  }

  /** @internal BullMQ-compatible connection — used by factory methods. */
  private get connection(): ConnectionOptions {
    if (!this.config.cluster) {
      return this._standaloneOptions();
    }
    return this._createCluster();
  }

  /**
   * Create a raw ioredis client for non-BullMQ consumers (e.g. Better Auth).
   *
   * The returned client has `keyPrefix` set to `{prefix}:` so all operations
   * are transparently prefixed without any consumer-side changes.
   *
   * Caller owns the lifecycle — call `.quit()` on shutdown.
   */
  createClient(): Redis | Cluster {
    const keyPrefix = `${this.config.prefix}:`;

    if (!this.config.cluster) {
      return new Redis(this.config.url, {
        keyPrefix,
        ...this._tlsOptions(),
      });
    }

    const parsed = new URL(this.config.url);
    const port = parsed.port ? Number(parsed.port) : 6379;

    return new Cluster([{ host: parsed.hostname, port }], {
      keyPrefix,
      redisOptions: {
        ...this._authOptions(parsed),
        ...this._tlsOptions(),
      },
      dnsLookup: (address: string, callback: (err: NodeJS.ErrnoException | null, address: string) => void) =>
        callback(null, address),
      slotsRefreshTimeout: 2000,
      slotsRefreshInterval: 10_000,
      enableOfflineQueue: true,
    });
  }

  // ---------------------------------------------------------------------------
  // BullMQ factory methods — connection and prefix are always injected
  // ---------------------------------------------------------------------------

  /** Create a BullMQ Queue. Connection and prefix are injected automatically. */
  createQueue(name: string, defaultJobOptions?: DefaultJobOptions): Queue {
    return new Queue(name, { connection: this.connection, prefix: this.prefix, defaultJobOptions });
  }

  /** Create a BullMQ Worker. Connection and prefix are injected automatically. */
  createWorker(name: string, processor: Processor, opts?: Omit<WorkerOptions, 'connection' | 'prefix'>): Worker {
    return new Worker(name, processor, { ...opts, connection: this.connection, prefix: this.prefix });
  }

  /** Create a BullMQ QueueEvents listener. Connection and prefix are injected automatically. */
  createQueueEvents(name: string): QueueEvents {
    return new QueueEvents(name, { connection: this.connection, prefix: this.prefix });
  }

  /** Create a BullMQ FlowProducer. Connection and prefix are injected automatically. */
  createFlowProducer(): FlowProducer {
    return new FlowProducer({ connection: this.connection, prefix: this.prefix });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** @internal */
  private _standaloneOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = { url: this.config.url };
    const tls = this._tlsOptions();
    if (tls.tls) {
      opts.tls = tls.tls;
    }
    return opts;
  }

  /** @internal */
  private _createCluster(): Cluster {
    const parsed = new URL(this.config.url);
    const port = parsed.port ? Number(parsed.port) : 6379;

    return new Cluster([{ host: parsed.hostname, port }], {
      redisOptions: {
        ...this._authOptions(parsed),
        ...this._tlsOptions(),
      },
      dnsLookup: (address: string, callback: (err: NodeJS.ErrnoException | null, address: string) => void) =>
        callback(null, address),
      slotsRefreshTimeout: 2000,
      slotsRefreshInterval: 10_000,
      enableOfflineQueue: true,
    });
  }

  /** @internal — Extract username/password from URL. */
  private _authOptions(parsed: URL): Record<string, string> {
    const opts: Record<string, string> = {};
    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== 'default') {
      opts.username = decodeURIComponent(parsed.username);
    }
    return opts;
  }

  /** @internal — TLS options auto-detected from `rediss://` scheme. */
  private _tlsOptions(): { tls?: Record<string, never> } {
    if (this.config.url.startsWith('rediss://')) {
      return { tls: {} };
    }
    return {};
  }
}
