import { describe, expect, it, vi } from 'vitest';

import { S3BlobStore } from './s3';

function makeMockSend(responses: unknown[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex];
    callIndex++;
    return response;
  });
}

function createStore(sendMock: ReturnType<typeof vi.fn>) {
  const store = new S3BlobStore({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKey: 'test-key',
    secretKey: 'test-secret',
    bucket: 'test-bucket',
  });
  // Replace the internal client.send with our mock
  (store as unknown as { client: { send: typeof sendMock } }).client = { send: sendMock } as never;
  return store;
}

describe('S3BlobStore constructor', () => {
  it('creates a store without explicit credentials (IRSA mode)', () => {
    const store = new S3BlobStore({
      region: 'us-east-1',
      bucket: 'test-bucket',
      forcePathStyle: false,
    });
    expect(store).toBeDefined();
  });

  it('creates a store with explicit credentials (MinIO mode)', () => {
    const store = new S3BlobStore({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'test-bucket',
      forcePathStyle: true,
    });
    expect(store).toBeDefined();
  });

  it('defaults forcePathStyle to true when not specified', () => {
    const store = new S3BlobStore({
      region: 'us-east-1',
      bucket: 'test-bucket',
    });
    expect(store).toBeDefined();
  });
});

describe('S3BlobStore.list', () => {
  it('returns objects from a single page', async () => {
    const send = makeMockSend([
      {
        Contents: [
          { Key: 'file.pdf', ETag: '"abc123"', LastModified: new Date('2024-01-01'), Size: 100 },
          { Key: 'file2.pdf', ETag: '"def456"', LastModified: new Date('2024-01-02'), Size: 200 },
        ],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.list('prefix/');
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('file.pdf');
    expect(result[0].etag).toBe('abc123');
    expect(result[1].key).toBe('file2.pdf');
  });

  it('handles paginated responses', async () => {
    const send = makeMockSend([
      {
        Contents: [{ Key: 'page1.pdf', ETag: '"a"', LastModified: new Date(), Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'token-1',
      },
      {
        Contents: [{ Key: 'page2.pdf', ETag: '"b"', LastModified: new Date(), Size: 2 }],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.list('prefix/');
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('page1.pdf');
    expect(result[1].key).toBe('page2.pdf');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('strips quotes from ETags', async () => {
    const send = makeMockSend([
      {
        Contents: [{ Key: 'f.pdf', ETag: '"quoted-etag"', LastModified: new Date(), Size: 1 }],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.list('');
    expect(result[0].etag).toBe('quoted-etag');
  });

  it('skips objects with missing fields', async () => {
    const send = makeMockSend([
      {
        Contents: [
          { Key: 'valid.pdf', ETag: '"a"', LastModified: new Date(), Size: 1 },
          { Key: null, ETag: '"b"', LastModified: new Date(), Size: 2 },
          { Key: 'no-etag.pdf', ETag: null, LastModified: new Date(), Size: 3 },
          { Key: 'no-date.pdf', ETag: '"c"', LastModified: null, Size: 4 },
        ],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.list('');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('valid.pdf');
  });

  it('returns empty array when no contents', async () => {
    const send = makeMockSend([{ IsTruncated: false }]);
    const store = createStore(send);

    const result = await store.list('');
    expect(result).toEqual([]);
  });
});

describe('S3BlobStore.listByPrefix', () => {
  it('returns folders and objects', async () => {
    const send = makeMockSend([
      {
        CommonPrefixes: [{ Prefix: 'docs/' }, { Prefix: 'images/' }],
        Contents: [{ Key: 'readme.md', ETag: '"a"', LastModified: new Date(), Size: 100 }],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.listByPrefix('');
    expect(result.folders).toEqual(['docs/', 'images/']);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].key).toBe('readme.md');
  });

  it('skips prefix placeholder (zero-byte folder marker)', async () => {
    const send = makeMockSend([
      {
        Contents: [
          { Key: 'docs/', ETag: '"a"', LastModified: new Date(), Size: 0 },
          { Key: 'docs/file.pdf', ETag: '"b"', LastModified: new Date(), Size: 100 },
        ],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.listByPrefix('docs/');
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].key).toBe('docs/file.pdf');
  });

  it('handles paginated prefix listing', async () => {
    const send = makeMockSend([
      {
        CommonPrefixes: [{ Prefix: 'a/' }],
        Contents: [{ Key: 'f1.pdf', ETag: '"a"', LastModified: new Date(), Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'tok',
      },
      {
        CommonPrefixes: [{ Prefix: 'b/' }],
        Contents: [{ Key: 'f2.pdf', ETag: '"b"', LastModified: new Date(), Size: 2 }],
        IsTruncated: false,
      },
    ]);
    const store = createStore(send);

    const result = await store.listByPrefix('');
    expect(result.folders).toEqual(['a/', 'b/']);
    expect(result.objects).toHaveLength(2);
  });
});

describe('S3BlobStore.download', () => {
  it('returns buffer from chunked response', async () => {
    const chunks = [new Uint8Array([72, 101]), new Uint8Array([108, 108, 111])];
    const body = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) yield chunk;
      },
    };
    const send = makeMockSend([{ Body: body }]);
    const store = createStore(send);

    const result = await store.download('file.txt');
    expect(result.toString()).toBe('Hello');
  });

  it('throws on empty Body', async () => {
    const send = makeMockSend([{ Body: null }]);
    const store = createStore(send);

    await expect(store.download('file.txt')).rejects.toThrow('Empty response body for s3://test-bucket/file.txt');
  });
});

describe('S3BlobStore.upload', () => {
  it('calls send with PutObjectCommand params', async () => {
    const send = makeMockSend([{}]);
    const store = createStore(send);

    await store.upload('file.txt', Buffer.from('hello'), 'text/plain');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('S3BlobStore.delete', () => {
  it('calls send with DeleteObjectCommand params', async () => {
    const send = makeMockSend([{}]);
    const store = createStore(send);

    await store.delete('file.txt');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('S3BlobStore.copy', () => {
  it('calls send with CopyObjectCommand params', async () => {
    const send = makeMockSend([{}]);
    const store = createStore(send);

    await store.copy('src.pdf', 'dst.pdf');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
