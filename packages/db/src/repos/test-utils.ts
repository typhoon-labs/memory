/**
 * Integration test utilities for repo-level tests.
 *
 * Usage:
 *   const { db, sql } = createTestConnection();
 *   beforeEach(async () => { await clearAllTables(db); });
 *   afterAll(async () => { await clearAllTables(db); await sql.end(); });
 */
import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { Db } from '../client';
import { documents } from '../schema/document';
import { feedback } from '../schema/feedback';
import { messages } from '../schema/messages';
import { aiSpans } from '../schema/observability';
import { scores } from '../schema/scores';
import { syncTargets } from '../schema/sync-target';
import { threads } from '../schema/threads';
import { scorerDefinitions, scorerDefinitionVersions } from '../schema/versioned/scorer-definitions';
import { DashboardRepo } from './dashboard.repo';
import { DocumentRepo } from './document.repo';
import { ExperimentRepo } from './experiment.repo';
import { FailedJobRepo } from './failed-job.repo';
import { FeedbackRepo } from './feedback.repo';
import { MessageRepo } from './message.repo';
import { MetadataRepo } from './metadata.repo';
import { PartitionRepo } from './partition.repo';
import { ReviewRepo } from './review.repo';
import { ScoreRepo } from './score.repo';
import { ScorerRepo } from './scorer.repo';
import { SyncJobRepo } from './sync-job.repo';
import { SyncTargetRepo } from './sync-target.repo';
import { ThreadRepo } from './thread.repo';
import { TraceRepo } from './trace.repo';

export { createTestConnection, TEST_DB_URL } from '../drivers/pg/test-utils';

/** Create all repos wired to the given Db instance. */
export function createTestRepos(db: Db) {
  return {
    dashboard: new DashboardRepo(db),
    document: new DocumentRepo(db),
    experiment: new ExperimentRepo(db),
    failedJob: new FailedJobRepo(db),
    feedback: new FeedbackRepo(db),
    message: new MessageRepo(db),
    metadata: new MetadataRepo(db),
    partition: new PartitionRepo(db),
    review: new ReviewRepo(db),
    score: new ScoreRepo(db),
    scorer: new ScorerRepo(db),
    syncJob: new SyncJobRepo(db),
    syncTarget: new SyncTargetRepo(db),
    thread: new ThreadRepo(db),
    trace: new TraceRepo(db),
  };
}

/**
 * TRUNCATE all custom schema tables in FK-safe order.
 * Uses CASCADE to handle FK constraints automatically.
 */
export async function clearAllTables(db: Db) {
  await db.execute(sql`
    TRUNCATE TABLE
      "feedback",
      "messages",
      "threads",
      "scores",
      "ai_spans",
      "failed_jobs",
      "sync_jobs",
      "documents",
      "sync_targets",
      "metadata_templates",
      "metadata_field_groups",
      "scorer_definition_versions",
      "scorer_definitions",
      "experiment_results",
      "experiments",
      "dataset_items",
      "dataset_versions",
      "datasets",
      "session",
      "account",
      "apikey",
      "user"
    CASCADE
  `);
}

// ── Seed helpers ──────────────────────────────────────────────────────────

/** Insert a minimal sync target row, returning its ID and name. */
export async function seedSyncTarget(db: Db) {
  const id = crypto.randomUUID();
  const name = `test-source-${id.slice(0, 8)}`;
  await db.insert(syncTargets).values({
    id,
    name,
    sourceType: 's3',
    config: { bucket: 'test-bucket' },
  });
  return { id, name };
}

/** Insert a minimal document row. Requires an existing syncTargetId. */
export async function seedDocument(db: Db, syncTargetId: string, overrides?: Partial<typeof documents.$inferInsert>) {
  const id = crypto.randomUUID();
  const sourceKey = `docs/${id.slice(0, 8)}.pdf`;
  const [row] = await db
    .insert(documents)
    .values({ id, syncTargetId, sourceKey, status: 'ready', ...overrides })
    .returning();
  return row;
}

/** Insert a minimal thread row, returning its internal ID and externalId. */
export async function seedThread(db: Db, overrides?: Partial<typeof threads.$inferInsert>) {
  const id = crypto.randomUUID();
  const externalId = `ext-${id.slice(0, 8)}`;
  const resourceId = overrides?.resourceId ?? `res-${id.slice(0, 8)}`;
  await db.insert(threads).values({ id, externalId, resourceId, title: 'Test Thread', ...overrides });
  return { id, externalId, resourceId };
}

/** Insert a minimal message row. Requires an existing threadId (internal UUID). */
export async function seedMessage(db: Db, threadId: string, overrides?: Partial<typeof messages.$inferInsert>) {
  const id = crypto.randomUUID();
  const externalId = `msg-${id.slice(0, 8)}`;
  await db.insert(messages).values({
    id,
    externalId,
    threadId,
    role: 'assistant',
    content: { text: 'Test message' },
    ...overrides,
  });
  return { id, externalId };
}

/** Insert a feedback row. Requires threadId, messageId, and userId (all internal UUIDs). */
export async function seedFeedback(
  db: Db,
  data: { threadId: string; messageId: string; userId: string; rating: 'positive' | 'negative'; comment?: string },
) {
  const [row] = await db.insert(feedback).values(data).returning();
  return row;
}

/** Insert a score row. Uses raw SQL to match how ReviewRepo writes scores. */
export async function seedScore(
  db: Db,
  data: {
    threadId: string;
    entityId: string;
    entityType?: string;
    scorerId: string;
    score: number;
    metadata?: Record<string, unknown>;
    resourceId?: string;
  },
) {
  const id = crypto.randomUUID();
  await db.insert(scores).values({
    id,
    threadId: data.threadId,
    entityId: data.entityId,
    entityType: data.entityType ?? 'message',
    scorerId: data.scorerId,
    score: data.score,
    metadata: data.metadata,
    resourceId: data.resourceId,
  });
  return { id };
}

/** Insert an ai_span row. Returns the generated UUID. */
export async function seedSpan(
  db: Db,
  data: {
    traceId: string;
    spanId: string;
    name: string;
    spanType: string;
    startedAt: Date;
    endedAt?: Date | null;
    parentSpanId?: string | null;
    entityType?: string | null;
    entityName?: string | null;
    threadId?: string | null;
    error?: Record<string, unknown> | null;
    attributes?: Record<string, unknown> | null;
    serviceName?: string | null;
  },
) {
  const id = crypto.randomUUID();
  await db.insert(aiSpans).values({
    id,
    traceId: data.traceId,
    spanId: data.spanId,
    name: data.name,
    spanType: data.spanType,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    parentSpanId: data.parentSpanId,
    entityType: data.entityType,
    entityName: data.entityName,
    threadId: data.threadId,
    error: data.error,
    attributes: data.attributes,
    serviceName: data.serviceName,
  });
  return { id };
}

/** Insert a user row in the auth "user" table. Returns the internal UUID. */
export async function seedUser(db: Db, overrides?: { name?: string; email?: string }) {
  const id = crypto.randomUUID();
  const name = overrides?.name ?? `Test User ${id.slice(0, 6)}`;
  const email = overrides?.email ?? `test-${id.slice(0, 8)}@typhoon.local`;
  await db.execute(sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${id}, ${name}, ${email}, true)`);
  return { id, name, email };
}

/** Insert a scorer definition with one version. Returns { id, versionId }. */
export async function seedScorerDefinition(
  db: Db,
  overrides?: {
    status?: 'draft' | 'active' | 'archived';
    name?: string;
    type?: string;
    setActiveVersion?: boolean;
  },
) {
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const status = overrides?.status ?? 'active';
  const name = overrides?.name ?? `Test Scorer ${id.slice(0, 6)}`;

  await db.insert(scorerDefinitions).values({
    id,
    status,
    activeVersionId: overrides?.setActiveVersion !== false ? versionId : undefined,
  });

  await db.insert(scorerDefinitionVersions).values({
    id: versionId,
    scorerDefinitionId: id,
    versionNumber: 1,
    name,
    type: overrides?.type ?? 'faithfulness',
  });

  return { id, versionId };
}
