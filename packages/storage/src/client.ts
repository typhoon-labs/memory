import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3Client as S3ClientType,
} from '@aws-sdk/client-s3';
import type { S3Env } from '@typhoon/config';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('storage');

export interface S3Object {
  key: string;
  etag: string;
  lastModified: Date;
  size: number;
}

export function createS3Client(env: S3Env): S3ClientType {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });
}

export async function listObjects(client: S3ClientType, bucket: string, prefix: string): Promise<S3Object[]> {
  log.debug('Listing S3 objects', { bucket, prefix });
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.ETag && obj.LastModified && obj.Size !== undefined) {
        objects.push({
          key: obj.Key,
          etag: obj.ETag.replace(/"/g, ''),
          lastModified: obj.LastModified,
          size: obj.Size,
        });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function downloadObject(client: S3ClientType, bucket: string, key: string): Promise<Buffer> {
  log.debug('Downloading S3 object', { bucket, key });
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!response.Body) {
    throw new Error(`Empty response body for s3://${bucket}/${key}`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(client: S3ClientType, bucket: string, key: string): Promise<void> {
  log.debug('Deleting S3 object', { bucket, key });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function uploadObject(
  client: S3ClientType,
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  log.debug('Uploading S3 object', { bucket, key, contentType });
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}
