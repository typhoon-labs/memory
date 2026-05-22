import { EMBEDDING_DIMENSION } from '@typhoon/ai';
import type { Db } from '@typhoon/db';
import { PgVector } from '@typhoon/db/drivers/pg';
import { SyncTargetRepo } from '@typhoon/db/repos';
import { createAppLogger } from '@typhoon/logger';
import type { ConfigSyncTarget } from '@typhoon/types';
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
      indexConfig: {
        type: 'hnsw',
        hnsw: { m: 16, efConstruction: 64 },
      },
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

  const syncTargetRepo = new SyncTargetRepo(db);
  const configNames: string[] = [];

  for (const target of targets) {
    configNames.push(target.name);

    // oxlint-disable-next-line no-await-in-loop -- sequential: find then create/update per target
    const existing = await syncTargetRepo.findByName(target.name);

    const values = {
      sourceType: target.sourceType,
      config: target.config,
      cronSchedule: target.cronSchedule,
      isActive: target.isActive,
      source: target.source,
    };

    if (existing) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on findByName result
      await syncTargetRepo.update(existing.id, { ...values, managedBy: 'config' });
    } else {
      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on findByName result
      await syncTargetRepo.create({ name: target.name, managedBy: 'config', ...values });
    }
  }

  // Deactivate orphaned config targets in a single query
  if (configNames.length > 0) {
    const deactivated = await syncTargetRepo.deactivateOrphaned(configNames);

    for (const name of deactivated) {
      log.warn('Config sync target not found in config, deactivated', { name });
    }
  }

  log.info('Reconciled config sync targets', { count: targets.length });
}
