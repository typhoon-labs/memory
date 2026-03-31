/**
 * Registers named credential sources for S3/MinIO connectors.
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
    credentials: {
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY ?? '',
      secretKey: process.env.S3_SECRET_KEY ?? '',
    },
  });

  // ---------------------------------------------------------------------------
  // Additional sources (uncomment / duplicate as needed)
  // ---------------------------------------------------------------------------
  // if (process.env.S3_STAGING_ENDPOINT) {
  //   registerSource({
  //     name: 's3-staging',
  //     credentials: {
  //       endpoint: process.env.S3_STAGING_ENDPOINT,
  //       region: process.env.S3_STAGING_REGION ?? 'us-east-1',
  //       accessKey: process.env.S3_STAGING_ACCESS_KEY ?? '',
  //       secretKey: process.env.S3_STAGING_SECRET_KEY ?? '',
  //     },
  //   });
  // }
}
