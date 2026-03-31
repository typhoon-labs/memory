import { EMBEDDING_DIMENSION } from '@typhoon/ai';
import type { Db } from '@typhoon/db';
import { syncTargets } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import { PgVector } from '@typhoon/pg';
import type { ConfigSyncTarget } from '@typhoon/types';
import { and, eq, notInArray } from 'drizzle-orm';
import type { Sql } from 'postgres';

const log = createAppLogger('init');

/**
 * Initialize the PgVector knowledge_base index if it doesn't exist.
 * Called once on server startup.
 */
export async function initVectorIndex(sqlClient: Sql): Promise<void> {
  const pgVector = new PgVector({ id: 'typhoon-vectors', sql: sqlClient });
  try {
    await pgVector.createIndex({
      indexName: 'knowledge_base',
      dimension: EMBEDDING_DIMENSION,
    });
    log.info('Vector index ready', { index: 'knowledge_base' });
  } catch (error) {
    // Index may already exist — that's fine
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists')) {
      log.debug('Vector index already exists', { index: 'knowledge_base' });
    } else {
      throw error;
    }
  }
}

/**
 * Reconcile registered sync targets with the database.
 *
 * Targets are already validated at registration time, so this is
 * a simple upsert + orphan deactivation. Manual targets are never touched.
 */
export async function reconcileConfigSyncTargets(db: Db, targets: ConfigSyncTarget[]): Promise<void> {
  if (targets.length === 0) return;

  const now = new Date();
  const configNames: string[] = [];

  for (const target of targets) {
    configNames.push(target.name);

    // Upsert: the unique index on (name, COALESCE(managed_by, 'manual')) uses an
    // expression column, which Drizzle can't target with onConflictDoUpdate.
    // Use an explicit select + insert/update instead, batched into one read.
    const [existing] = await db
      .select({ id: syncTargets.id })
      .from(syncTargets)
      .where(eq(syncTargets.name, target.name));

    const values = {
      sourceType: target.sourceType,
      config: target.config,
      cronSchedule: target.cronSchedule,
      isActive: target.isActive,
      source: target.source,
    };

    if (existing) {
      await db
        .update(syncTargets)
        .set({ ...values, managedBy: 'config', updatedAt: now })
        .where(eq(syncTargets.id, existing.id));
    } else {
      await db.insert(syncTargets).values({ name: target.name, managedBy: 'config', ...values });
    }
  }

  // Deactivate orphaned config targets in a single query
  if (configNames.length > 0) {
    const deactivated = await db
      .update(syncTargets)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(syncTargets.managedBy, 'config'), notInArray(syncTargets.name, configNames)))
      .returning({ name: syncTargets.name });

    for (const row of deactivated) {
      log.warn('Config sync target not found in config, deactivated', { name: row.name });
    }
  }

  log.info('Reconciled config sync targets', { count: targets.length });
}
