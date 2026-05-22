import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createAppLogger } from '@typhoon/logger';

import type { BlobObject, BlobStore, ListResult } from '../types';

const log = createAppLogger('blob-store:s3');

/** Configuration for creating an S3-backed blob store. */
export interface S3BlobStoreConfig {
  /** S3 endpoint URL. When omitted, the AWS SDK resolves it from the region. */
  endpoint?: string;
  region: string;
  /** S3 access key. When omitted, the AWS SDK uses the default credential chain (IRSA, instance profile, env vars). */
  accessKey?: string;
  /** S3 secret key. When omitted, the AWS SDK uses the default credential chain. */
  secretKey?: string;
  bucket: string;
  /** Use path-style URLs (e.g. `http://host/bucket/key`). Required for MinIO, should be `false` for real S3. Default: `true`. */
  forcePathStyle?: boolean;
}

/**
 * S3-compatible blob store adapter.
 * Works with AWS S3, MinIO, and other S3-compatible services.
 */
export class S3BlobStore implements BlobStore {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3BlobStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? true,
      ...(config.accessKey && config.secretKey
        ? {
            credentials: {
              accessKeyId: config.accessKey,
              secretAccessKey: config.secretKey,
            },
          }
        : {}),
    });
  }

  async list(prefix: string): Promise<BlobObject[]> {
    log.debug('Listing objects', { bucket: this.bucket, prefix });
    const objects: BlobObject[] = [];
    let continuationToken: string | undefined;

    do {
      // oxlint-disable-next-line no-await-in-loop -- pagination: each page depends on previous continuationToken
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key && obj.ETag && obj.LastModified && obj.Size !== undefined) {
          objects.push({
            key: obj.Key,
            etag: obj.ETag.replaceAll('"', ''),
            lastModified: obj.LastModified,
            size: obj.Size,
          });
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects;
  }

  async listByPrefix(prefix: string): Promise<ListResult> {
    log.debug('Listing objects by prefix', { bucket: this.bucket, prefix });
    const folders: string[] = [];
    const objects: BlobObject[] = [];
    let continuationToken: string | undefined;

    do {
      // oxlint-disable-next-line no-await-in-loop -- pagination: each page depends on previous continuationToken
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const cp of response.CommonPrefixes ?? []) {
        if (cp.Prefix) folders.push(cp.Prefix);
      }

      for (const obj of response.Contents ?? []) {
        // Skip the prefix placeholder itself (zero-byte folder marker)
        if (obj.Key === prefix) continue;
        if (obj.Key && obj.ETag && obj.LastModified && obj.Size !== undefined) {
          objects.push({
            key: obj.Key,
            etag: obj.ETag.replaceAll('"', ''),
            lastModified: obj.LastModified,
            size: obj.Size,
          });
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return { folders, objects };
  }

  async download(key: string): Promise<Buffer> {
    log.debug('Downloading object', { bucket: this.bucket, key });
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

    if (!response.Body) {
      throw new Error(`Empty response body for s3://${this.bucket}/${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async upload(key: string, body: Buffer | Uint8Array | string, contentType?: string): Promise<void> {
    log.debug('Uploading object', { bucket: this.bucket, key, contentType });
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    log.debug('Deleting object', { bucket: this.bucket, key });
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    log.debug('Copying object', { bucket: this.bucket, sourceKey, destinationKey });
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      }),
    );
  }
}
