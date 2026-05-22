import { S3BlobStore } from '@typhoon/blob-store';

import { getSource } from '../source-registry';
import type { BrowseResult, SourceObject, SourceProvider } from './types';

interface S3Config {
  prefix?: string;
}

export function resolveStore(config: Record<string, unknown>, sourceName?: string) {
  const s3Config = config as unknown as S3Config;
  const source = sourceName ? getSource(sourceName) : undefined;
  const creds = source?.credentials;
  const bucket = source?.config?.bucket as string | undefined;
  if (!bucket) throw new Error('S3 source must define a bucket in its config');
  const store = new S3BlobStore({
    endpoint: (creds?.endpoint as string | undefined) ?? process.env.S3_ENDPOINT,
    region: (creds?.region as string | undefined) ?? process.env.S3_REGION ?? 'us-east-1',
    accessKey: (creds?.accessKey as string | undefined) ?? (process.env.S3_ACCESS_KEY || undefined),
    secretKey: (creds?.secretKey as string | undefined) ?? (process.env.S3_SECRET_KEY || undefined),
    forcePathStyle: creds?.forcePathStyle !== undefined ? Boolean(creds.forcePathStyle) : true,
    bucket,
  });
  return { store, prefix: s3Config.prefix ?? '' };
}

export class S3Provider implements SourceProvider {
  async listObjects(config: Record<string, unknown>, sourceName?: string): Promise<SourceObject[]> {
    const { store, prefix } = resolveStore(config, sourceName);
    return store.list(prefix);
  }

  async download(config: Record<string, unknown>, key: string, sourceName?: string): Promise<Buffer> {
    const { store } = resolveStore(config, sourceName);
    return store.download(key);
  }

  async browse(config: Record<string, unknown>, path: string, sourceName?: string): Promise<BrowseResult> {
    const { store, prefix } = resolveStore(config, sourceName);
    const fullPrefix = `${prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : ''}${path}`;
    return store.listByPrefix(fullPrefix);
  }

  async upload(
    config: Record<string, unknown>,
    key: string,
    content: Buffer,
    contentType?: string,
    sourceName?: string,
  ): Promise<void> {
    const { store } = resolveStore(config, sourceName);
    await store.upload(key, content, contentType);
  }

  async deleteObject(config: Record<string, unknown>, key: string, sourceName?: string): Promise<void> {
    const { store } = resolveStore(config, sourceName);
    await store.delete(key);
  }

  async copyObject(
    config: Record<string, unknown>,
    sourceKey: string,
    destKey: string,
    sourceName?: string,
  ): Promise<void> {
    const { store } = resolveStore(config, sourceName);
    await store.copy(sourceKey, destKey);
  }

  async createFolder(config: Record<string, unknown>, path: string, sourceName?: string): Promise<void> {
    const { store } = resolveStore(config, sourceName);
    const folderKey = path.endsWith('/') ? path : `${path}/`;
    await store.upload(folderKey, '');
  }
}
