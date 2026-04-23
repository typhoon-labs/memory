/**
 * Backfill scoring jobs for existing assistant messages.
 *
 * Usage:
 *   bun run scripts/backfill-scores.ts [--limit=1000] [--since=2026-04-01] [--dry-run]
 *
 * Enqueues scoring jobs in batches of 50 with 5s pauses between batches.
 * Uses priority: 10 so live scoring (priority 0) takes precedence.
 */

import { createDb, messages, threads } from '@typhoon/db';
import type { ScoringJobData } from '@typhoon/ingestion';
import { createScoringQueue } from '@typhoon/ingestion';
import { and, desc, eq, gte } from 'drizzle-orm';
import postgres from 'postgres';

// ── Parse CLI args ──────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx === -1) {
        result[arg.slice(2)] = true;
      } else {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const limit = Number(args.limit ?? 1000);
const since = args.since ? new Date(args.since as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const dryRun = !!args['dry-run'];
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 5000;

// ── Connect ─────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const sql = postgres(connectionString);
const db = createDb(sql);
const queue = createScoringQueue({ url: redisUrl });

// ── Query ───────────────────────────────────────────────────────────

console.log(`Querying assistant messages since ${since.toISOString()} (limit: ${limit})...`);

const assistantMessages = await db
  .select({
    messageExternalId: messages.externalId,
    threadExternalId: threads.externalId,
    createdAt: messages.createdAt,
  })
  .from(messages)
  .innerJoin(threads, eq(messages.threadId, threads.id))
  .where(and(eq(messages.role, 'assistant'), gte(messages.createdAt, since)))
  .orderBy(desc(messages.createdAt))
  .limit(limit);

console.log(`Found ${assistantMessages.length} assistant messages.`);

if (assistantMessages.length === 0) {
  console.log('Nothing to backfill.');
  await queue.close();
  await sql.end();
  process.exit(0);
}

// ── Enqueue ─────────────────────────────────────────────────────────

let enqueued = 0;
let skipped = 0;

for (let i = 0; i < assistantMessages.length; i += BATCH_SIZE) {
  const batch = assistantMessages.slice(i, i + BATCH_SIZE);

  for (const msg of batch) {
    const jobId = `score-${msg.messageExternalId}`;

    // Idempotency: skip if job already exists
    const existing = await queue.getJob(jobId);
    if (existing) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would enqueue: ${jobId} (${msg.createdAt.toISOString()})`);
      enqueued++;
      continue;
    }

    await queue.add(
      'score-message',
      {
        messageId: msg.messageExternalId,
        threadId: msg.threadExternalId,
        agentId: 'typhoon-supervisor',
        traceId: null,
      } satisfies ScoringJobData,
      {
        jobId,
        priority: 10, // lower priority than live scoring (default 0)
      },
    );
    enqueued++;
  }

  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(assistantMessages.length / BATCH_SIZE);
  console.log(`Batch ${batchNum}/${totalBatches} — Enqueued: ${enqueued}, Skipped: ${skipped}`);

  // Pause between batches (except last)
  if (i + BATCH_SIZE < assistantMessages.length && !dryRun) {
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
}

console.log(`\nDone. Enqueued: ${enqueued}, Skipped: ${skipped}${dryRun ? ' (dry run)' : ''}`);

await queue.close();
await sql.end();
