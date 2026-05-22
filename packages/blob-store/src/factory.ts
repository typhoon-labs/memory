import { S3BlobStore, type S3BlobStoreConfig } from './adapters/s3';
import type { BlobStore } from './types';

export type BlobStoreConfig = { provider: 's3' } & S3BlobStoreConfig;

/** Create a BlobStore instance from configuration. */
export function createBlobStore(config: BlobStoreConfig): BlobStore {
  switch (config.provider) {
    case 's3':
      return new S3BlobStore(config);
    default:
      throw new Error(`Unknown blob store provider: ${(config as { provider: string }).provider}`);
  }
}
