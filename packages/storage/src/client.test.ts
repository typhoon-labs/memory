import { describe, expect, it, vi } from 'vitest';

import { downloadObject, listObjects, listObjectsByPrefix } from './client';

function makeMockClient(responses: unknown[]) {
  let callIndex = 0;
  return {
    send: vi.fn(async () => {
      const response = responses[callIndex];
      callIndex++;
      return response;
    }),
  };
}

describe('listObjects', () => {
  it('returns objects from a single page', async () => {
    const client = makeMockClient([
      {
        Contents: [
          { Key: 'file.pdf', ETag: '"abc123"', LastModified: new Date('2024-01-01'), Size: 100 },
          { Key: 'file2.pdf', ETag: '"def456"', LastModified: new Date('2024-01-02'), Size: 200 },
        ],
        IsTruncated: false,
      },
    ]);

    const result = await listObjects(client as never, 'bucket', 'prefix/');
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('file.pdf');
    expect(result[0].etag).toBe('abc123'); // Quotes stripped
    expect(result[1].key).toBe('file2.pdf');
  });

  it('handles paginated responses', async () => {
    const client = makeMockClient([
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

    const result = await listObjects(client as never, 'bucket', 'prefix/');
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('page1.pdf');
    expect(result[1].key).toBe('page2.pdf');
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('strips quotes from ETags', async () => {
    const client = makeMockClient([
      {
        Contents: [{ Key: 'f.pdf', ETag: '"quoted-etag"', LastModified: new Date(), Size: 1 }],
        IsTruncated: false,
      },
    ]);

    const result = await listObjects(client as never, 'bucket', '');
    expect(result[0].etag).toBe('quoted-etag');
  });

  it('skips objects with missing fields', async () => {
    const client = makeMockClient([
      {
        Contents: [
          { Key: 'valid.pdf', ETag: '"a"', LastModified: new Date(), Size: 1 },
          { Key: null, ETag: '"b"', LastModified: new Date(), Size: 2 }, // Missing Key
          { Key: 'no-etag.pdf', ETag: null, LastModified: new Date(), Size: 3 }, // Missing ETag
          { Key: 'no-date.pdf', ETag: '"c"', LastModified: null, Size: 4 }, // Missing LastModified
        ],
        IsTruncated: false,
      },
    ]);

    const result = await listObjects(client as never, 'bucket', '');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('valid.pdf');
  });

  it('returns empty array when no contents', async () => {
    const client = makeMockClient([{ IsTruncated: false }]);
    const result = await listObjects(client as never, 'bucket', '');
    expect(result).toEqual([]);
  });
});

describe('downloadObject', () => {
  it('returns buffer from chunked response', async () => {
    const chunks = [new Uint8Array([72, 101]), new Uint8Array([108, 108, 111])]; // "Hello"
    const body = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) yield chunk;
      },
    };
    const client = makeMockClient([{ Body: body }]);

    const result = await downloadObject(client as never, 'bucket', 'file.txt');
    expect(result.toString()).toBe('Hello');
  });

  it('throws on empty Body', async () => {
    const client = makeMockClient([{ Body: null }]);
    await expect(downloadObject(client as never, 'bucket', 'file.txt')).rejects.toThrow(
      'Empty response body for s3://bucket/file.txt',
    );
  });
});

describe('listObjectsByPrefix', () => {
  it('returns folders and objects', async () => {
    const client = makeMockClient([
      {
        CommonPrefixes: [{ Prefix: 'docs/' }, { Prefix: 'images/' }],
        Contents: [{ Key: 'readme.md', ETag: '"a"', LastModified: new Date(), Size: 100 }],
        IsTruncated: false,
      },
    ]);

    const result = await listObjectsByPrefix(client as never, 'bucket', '');
    expect(result.folders).toEqual(['docs/', 'images/']);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].key).toBe('readme.md');
  });

  it('skips prefix placeholder (zero-byte folder marker)', async () => {
    const prefix = 'docs/';
    const client = makeMockClient([
      {
        Contents: [
          { Key: 'docs/', ETag: '"a"', LastModified: new Date(), Size: 0 }, // Folder marker
          { Key: 'docs/file.pdf', ETag: '"b"', LastModified: new Date(), Size: 100 },
        ],
        IsTruncated: false,
      },
    ]);

    const result = await listObjectsByPrefix(client as never, 'bucket', prefix);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].key).toBe('docs/file.pdf');
  });

  it('handles paginated prefix listing', async () => {
    const client = makeMockClient([
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

    const result = await listObjectsByPrefix(client as never, 'bucket', '');
    expect(result.folders).toEqual(['a/', 'b/']);
    expect(result.objects).toHaveLength(2);
  });
});

describe('uploadObject', () => {
  it('calls send with PutObjectCommand', async () => {
    const client = makeMockClient([{}]);
    const { uploadObject } = await import('./client.js');
    await uploadObject(client as never, 'bucket', 'file.txt', Buffer.from('hello'), 'text/plain');
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

describe('deleteObject', () => {
  it('calls send with DeleteObjectCommand', async () => {
    const client = makeMockClient([{}]);
    const { deleteObject } = await import('./client.js');
    await deleteObject(client as never, 'bucket', 'file.txt');
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

describe('copyObject', () => {
  it('calls send with CopyObjectCommand', async () => {
    const client = makeMockClient([{}]);
    const { copyObject } = await import('./client.js');
    await copyObject(client as never, 'bucket', 'src.pdf', 'dst.pdf');
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
