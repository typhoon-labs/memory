import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/storage', () => ({
  createS3Client: vi.fn(() => 'mock-client'),
  listObjects: vi.fn(async () => []),
  downloadObject: vi.fn(async () => Buffer.from('data')),
  listObjectsByPrefix: vi.fn(async () => ({ folders: [], objects: [] })),
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  copyObject: vi.fn(async () => {}),
}));

vi.mock('../source-registry.js', () => ({
  getSource: vi.fn(),
}));

import {
  copyObject,
  createS3Client,
  deleteObject,
  downloadObject,
  listObjects,
  listObjectsByPrefix,
  uploadObject,
} from '@typhoon/storage';
import { getSource } from '../source-registry';
import { resolveS3Client, S3Provider } from './s3';

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveS3Client', () => {
  it('uses source registry credentials when sourceName provided', () => {
    vi.mocked(getSource).mockReturnValue({
      name: 'my-s3',
      sourceType: 's3',
      credentials: { endpoint: 'https://s3.example.com', region: 'eu-west-1', accessKey: 'ak', secretKey: 'sk' },
    });
    const result = resolveS3Client({ bucket: 'my-bucket' }, 'my-s3');
    expect(createS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        S3_ENDPOINT: 'https://s3.example.com',
        S3_REGION: 'eu-west-1',
        S3_ACCESS_KEY: 'ak',
        S3_SECRET_KEY: 'sk',
      }),
    );
    expect(result.bucket).toBe('my-bucket');
  });

  it('uses defaults when no sourceName', () => {
    resolveS3Client({ bucket: 'test-bucket' });
    expect(createS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        S3_ENDPOINT: expect.any(String),
        S3_REGION: expect.any(String),
      }),
    );
  });

  it('extracts prefix from config', () => {
    const result = resolveS3Client({ bucket: 'b', prefix: 'docs/' });
    expect(result.prefix).toBe('docs/');
  });

  it('defaults prefix to empty string', () => {
    const result = resolveS3Client({ bucket: 'b' });
    expect(result.prefix).toBe('');
  });
});

describe('S3Provider', () => {
  const provider = new S3Provider();
  const config = { bucket: 'test-bucket', prefix: 'data/' };

  it('listObjects maps to SourceObject format', async () => {
    vi.mocked(listObjects).mockResolvedValueOnce([
      { key: 'file.pdf', etag: 'abc', size: 100, lastModified: new Date('2024-01-01') },
    ]);
    const result = await provider.listObjects(config);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('file.pdf');
    expect(result[0].etag).toBe('abc');
  });

  it('download delegates to downloadObject', async () => {
    await provider.download(config, 'file.pdf');
    expect(downloadObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'file.pdf');
  });

  it('browse constructs fullPrefix with trailing slash', async () => {
    vi.mocked(listObjectsByPrefix).mockResolvedValueOnce({
      folders: ['subdir/'],
      objects: [{ key: 'data/file.pdf', etag: 'abc', size: 50, lastModified: new Date() }],
    });
    const result = await provider.browse(config, 'subpath/');
    expect(listObjectsByPrefix).toHaveBeenCalledWith('mock-client', 'test-bucket', 'data/subpath/');
    expect(result.folders).toEqual(['subdir/']);
    expect(result.objects).toHaveLength(1);
  });

  it('upload delegates to uploadObject', async () => {
    const content = Buffer.from('hello');
    await provider.upload(config, 'file.txt', content, 'text/plain');
    expect(uploadObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'file.txt', content, 'text/plain');
  });

  it('deleteObject delegates to storage deleteObject', async () => {
    await provider.deleteObject(config, 'file.pdf');
    expect(deleteObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'file.pdf');
  });

  it('copyObject delegates to storage copyObject', async () => {
    await provider.copyObject(config, 'src.pdf', 'dst.pdf');
    expect(copyObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'src.pdf', 'dst.pdf');
  });

  it('createFolder appends / and uploads empty content', async () => {
    await provider.createFolder(config, 'newfolder');
    expect(uploadObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'newfolder/', '');
  });

  it('createFolder does not double-slash', async () => {
    await provider.createFolder(config, 'folder/');
    expect(uploadObject).toHaveBeenCalledWith('mock-client', 'test-bucket', 'folder/', '');
  });
});
