/**
 * Composition root — wires repos for the scheduler.
 */
import { SyncTargetRepo } from '@typhoon/db/repos';

import { db } from './infra/db';

const syncTargetRepo = new SyncTargetRepo(db);

export function getSyncTargetRepo() {
  return syncTargetRepo;
}
