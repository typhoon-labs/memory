/**
 * Registers named credential sources for sync connectors.
 *
 * Each source maps a unique name to a set of credentials read from
 * environment variables. Sync targets reference a source by name —
 * credentials never touch the database.
 *
 * To add a new source, add another `registerSource()` call guarded
 * by the relevant env var check.
 */

import { registerSource } from '@typhoon/ingestion';

export function registerAllSources(): void {
  // ---------------------------------------------------------------------------
  // Default S3/MinIO source
  // ---------------------------------------------------------------------------
  registerSource({
    name: 's3-default',
    sourceType: 's3',
    credentials: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY || undefined,
      secretKey: process.env.S3_SECRET_KEY || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false' && process.env.S3_FORCE_PATH_STYLE !== '0',
    },
    config: {
      bucket: process.env.S3_BUCKET ?? 'typhoon-documents',
    },
  });
}
