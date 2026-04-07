import {
  copyObject,
  createS3Client,
  deleteObject,
  downloadObject,
  listObjects,
  listObjectsByPrefix,
  uploadObject,
} from '@typhoon/storage';
import { getSource } from '../source-registry.js';
import type { BrowseResult, SourceObject, SourceProvider } from './types.js';

interface S3Config {
  bucket: string;
  prefix?: string;
}

function resolveS3Client(config: Record<string, unknown>, sourceName?: string) {
  const s3Config = config as unknown as S3Config;
  const source = sourceName ? getSource(sourceName) : undefined;
  const client = createS3Client({
    S3_ENDPOINT: source?.credentials.endpoint ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    S3_REGION: source?.credentials.region ?? process.env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY: source?.credentials.accessKey ?? process.env.S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: source?.credentials.secretKey ?? process.env.S3_SECRET_KEY ?? '',
    S3_BUCKET: s3Config.bucket,
  });
  return { client, bucket: s3Config.bucket, prefix: s3Config.prefix ?? '' };
}

export class S3Provider implements SourceProvider {
  async listObjects(config: Record<string, unknown>, sourceName?: string): Promise<SourceObject[]> {
    const { client, bucket, prefix } = resolveS3Client(config, sourceName);
    const objects = await listObjects(client, bucket, prefix);
    return objects.map((o) => ({
      key: o.key,
      etag: o.etag,
      size: o.size,
      lastModified: o.lastModified,
    }));
  }

  async download(config: Record<string, unknown>, key: string, sourceName?: string): Promise<Buffer> {
    const { client, bucket } = resolveS3Client(config, sourceName);
    return downloadObject(client, bucket, key);
  }

  async browse(config: Record<string, unknown>, path: string, sourceName?: string): Promise<BrowseResult> {
    const { client, bucket, prefix } = resolveS3Client(config, sourceName);
    const fullPrefix = `${prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : ''}${path}`;
    const result = await listObjectsByPrefix(client, bucket, fullPrefix);
    return {
      folders: result.folders,
      objects: result.objects.map((o) => ({
        key: o.key,
        etag: o.etag,
        size: o.size,
        lastModified: o.lastModified,
      })),
    };
  }

  async upload(
    config: Record<string, unknown>,
    key: string,
    content: Buffer,
    contentType?: string,
    sourceName?: string,
  ): Promise<void> {
    const { client, bucket } = resolveS3Client(config, sourceName);
    await uploadObject(client, bucket, key, content, contentType);
  }

  async deleteObject(config: Record<string, unknown>, key: string, sourceName?: string): Promise<void> {
    const { client, bucket } = resolveS3Client(config, sourceName);
    await deleteObject(client, bucket, key);
  }

  async copyObject(
    config: Record<string, unknown>,
    sourceKey: string,
    destKey: string,
    sourceName?: string,
  ): Promise<void> {
    const { client, bucket } = resolveS3Client(config, sourceName);
    await copyObject(client, bucket, sourceKey, destKey);
  }

  async createFolder(config: Record<string, unknown>, path: string, sourceName?: string): Promise<void> {
    const { client, bucket } = resolveS3Client(config, sourceName);
    const folderKey = path.endsWith('/') ? path : `${path}/`;
    await uploadObject(client, bucket, folderKey, '');
  }
}
