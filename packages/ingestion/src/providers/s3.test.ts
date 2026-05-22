import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn(async () => [] as Array<{ key: string; etag: string; size: number; lastModified: Date }>);
const mockDownload = vi.fn(async () => Buffer.from('data'));
const mockListByPrefix = vi.fn(async () => ({
  folders: [] as string[],
  objects: [] as Array<{ key: string; etag: string; size: number; lastModified: Date }>,
}));
const mockUpload = vi.fn(async () => {});
const mockDelete = vi.fn(async () => {});
const mockCopy = vi.fn(async () => {});

const mockConstructor = vi.fn();

vi.mock('@typhoon/blob-store', () => {
  return {
    S3BlobStore: class MockS3BlobStore {
      constructor(...args: unknown[]) {
        mockConstructor(...args);
      }
      list = mockList;
      download = mockDownload;
      listByPrefix = mockListByPrefix;
      upload = mockUpload;
      delete = mockDelete;
      copy = mockCopy;
    },
  };
});

vi.mock('../source-registry.js', () => ({
  getSource: vi.fn(),
}));

import { getSource } from '../source-registry';
import { resolveStore, S3Provider } from './s3';

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveStore', () => {
  it('uses source registry credentials and config when sourceName provided', () => {
    vi.mocked(getSource).mockReturnValue({
      name: 'my-s3',
      sourceType: 's3',
      credentials: { endpoint: 'https://s3.example.com', region: 'eu-west-1', accessKey: 'ak', secretKey: 'sk' },
      config: { bucket: 'my-bucket' },
    });
    const result = resolveStore({}, 'my-s3');
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://s3.example.com',
        region: 'eu-west-1',
        accessKey: 'ak',
        secretKey: 'sk',
        bucket: 'my-bucket',
      }),
    );
    expect(result.prefix).toBe('');
  });

  it('throws when no sourceName provided', () => {
    expect(() => resolveStore({})).toThrow('S3 source must define a bucket');
  });

  it('throws when source has no bucket in config', () => {
    vi.mocked(getSource).mockReturnValue({
      name: 'no-bucket',
      sourceType: 's3',
      credentials: {},
      config: {},
    });
    expect(() => resolveStore({}, 'no-bucket')).toThrow('S3 source must define a bucket');
  });

  it('extracts prefix from sync target config', () => {
    vi.mocked(getSource).mockReturnValue({
      name: 'my-s3',
      sourceType: 's3',
      credentials: {},
      config: { bucket: 'b' },
    });
    const result = resolveStore({ prefix: 'docs/' }, 'my-s3');
    expect(result.prefix).toBe('docs/');
  });

  it('defaults prefix to empty string', () => {
    vi.mocked(getSource).mockReturnValue({
      name: 'my-s3',
      sourceType: 's3',
      credentials: {},
      config: { bucket: 'b' },
    });
    const result = resolveStore({}, 'my-s3');
    expect(result.prefix).toBe('');
  });
});

describe('S3Provider', () => {
  const provider = new S3Provider();
  const config = { prefix: 'data/' };
  const sourceName = 'test-s3';

  beforeEach(() => {
    vi.mocked(getSource).mockReturnValue({
      name: sourceName,
      sourceType: 's3',
      credentials: {},
      config: { bucket: 'test-bucket' },
    });
  });

  it('listObjects delegates to store.list', async () => {
    mockList.mockResolvedValueOnce([{ key: 'file.pdf', etag: 'abc', size: 100, lastModified: new Date('2024-01-01') }]);
    const result = await provider.listObjects(config, sourceName);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('file.pdf');
    expect(result[0].etag).toBe('abc');
    expect(mockList).toHaveBeenCalledWith('data/');
  });

  it('download delegates to store.download', async () => {
    await provider.download(config, 'file.pdf', sourceName);
    expect(mockDownload).toHaveBeenCalledWith('file.pdf');
  });

  it('browse constructs fullPrefix with trailing slash', async () => {
    mockListByPrefix.mockResolvedValueOnce({
      folders: ['subdir/'],
      objects: [{ key: 'data/file.pdf', etag: 'abc', size: 50, lastModified: new Date() }],
    });
    const result = await provider.browse(config, 'subpath/', sourceName);
    expect(mockListByPrefix).toHaveBeenCalledWith('data/subpath/');
    expect(result.folders).toEqual(['subdir/']);
    expect(result.objects).toHaveLength(1);
  });

  it('upload delegates to store.upload', async () => {
    const content = Buffer.from('hello');
    await provider.upload(config, 'file.txt', content, 'text/plain', sourceName);
    expect(mockUpload).toHaveBeenCalledWith('file.txt', content, 'text/plain');
  });

  it('deleteObject delegates to store.delete', async () => {
    await provider.deleteObject(config, 'file.pdf', sourceName);
    expect(mockDelete).toHaveBeenCalledWith('file.pdf');
  });

  it('copyObject delegates to store.copy', async () => {
    await provider.copyObject(config, 'src.pdf', 'dst.pdf', sourceName);
    expect(mockCopy).toHaveBeenCalledWith('src.pdf', 'dst.pdf');
  });

  it('createFolder appends / and uploads empty content', async () => {
    await provider.createFolder(config, 'newfolder', sourceName);
    expect(mockUpload).toHaveBeenCalledWith('newfolder/', '');
  });

  it('createFolder does not double-slash', async () => {
    await provider.createFolder(config, 'folder/', sourceName);
    expect(mockUpload).toHaveBeenCalledWith('folder/', '');
  });
});
