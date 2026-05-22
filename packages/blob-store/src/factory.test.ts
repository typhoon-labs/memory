import { describe, expect, it } from 'vitest';

import { S3BlobStore } from './adapters/s3';
import { createBlobStore } from './factory';

describe('createBlobStore', () => {
  it('creates an S3BlobStore for provider "s3"', () => {
    const store = createBlobStore({
      provider: 's3',
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKey: 'key',
      secretKey: 'secret',
      bucket: 'bucket',
    });
    expect(store).toBeInstanceOf(S3BlobStore);
  });

  it('throws for unknown provider', () => {
    expect(() =>
      createBlobStore({
        provider: 'gcs' as never,
        endpoint: '',
        region: '',
        accessKey: '',
        secretKey: '',
        bucket: '',
      }),
    ).toThrow('Unknown blob store provider: gcs');
  });
});
