/**
 * Registers code-defined sync targets for document ingestion.
 *
 * Each target is validated at registration time (Zod schema, source
 * reference, per-type config). Server refuses to start with bad config.
 *
 * Env vars provide per-target overrides for Docker/K8s deployments.
 * The `source` field references a registered credential source
 * (see ./sources.ts).
 */

import { registerSyncTarget } from '@typhoon/ingestion';

export function registerAllSyncTargets(): void {
  registerSyncTarget({
    name: 'Typhoon Documents',
    source: 's3-default',
    sourceType: 's3',
    config: {
      bucket: process.env.TYPHOON_DOCS_BUCKET ?? 'typhoon-documents',
      prefix: process.env.TYPHOON_DOCS_PREFIX ?? '',
    },
    cronSchedule: process.env.TYPHOON_DOCS_CRON ?? '0 */6 * * *',
  });
}
