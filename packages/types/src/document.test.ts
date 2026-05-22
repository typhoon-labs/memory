import { describe, expect, it } from 'vitest';

import { documentSchema, documentStatusEnum } from './document';

// =============================================================================
// documentStatusEnum
// =============================================================================

describe('documentStatusEnum', () => {
  it.each(['pending', 'processing', 'ready', 'error', 'deleted'] as const)('parses "%s"', (status) => {
    expect(documentStatusEnum.parse(status)).toBe(status);
  });

  it('rejects unknown status', () => {
    expect(documentStatusEnum.safeParse('unknown').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(documentStatusEnum.safeParse('').success).toBe(false);
  });
});

// =============================================================================
// documentSchema
// =============================================================================

describe('documentSchema', () => {
  const validDocument = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    syncTargetId: '550e8400-e29b-41d4-a716-446655440001',
    sourceKey: 'docs/readme.md',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  it('parses a minimal valid document with defaults', () => {
    const result = documentSchema.parse(validDocument);
    expect(result.id).toBe(validDocument.id);
    expect(result.syncTargetId).toBe(validDocument.syncTargetId);
    expect(result.sourceKey).toBe('docs/readme.md');
    expect(result.status).toBe('pending');
    expect(result.chunkCount).toBe(0);
    expect(result.customMetadata).toEqual({});
  });

  it('parses a full document', () => {
    const full = {
      ...validDocument,
      sourceEtag: '"abc123"',
      mimeType: 'text/markdown',
      fileSize: 1024,
      title: 'README',
      author: 'Alice',
      pageCount: 5,
      status: 'ready' as const,
      errorMessage: null,
      chunkCount: 12,
      customMetadata: { region: 'US' },
      contentHash: 'sha256:abc',
      lastSyncedAt: new Date('2024-01-03'),
    };
    const result = documentSchema.parse(full);
    expect(result.title).toBe('README');
    expect(result.chunkCount).toBe(12);
    expect(result.customMetadata).toEqual({ region: 'US' });
  });

  it('applies default null for nullable fields', () => {
    const result = documentSchema.parse(validDocument);
    expect(result.sourceEtag).toBeNull();
    expect(result.mimeType).toBeNull();
    expect(result.fileSize).toBeNull();
    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.pageCount).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.contentHash).toBeNull();
    expect(result.lastSyncedAt).toBeNull();
  });

  it('accepts explicit null for nullable fields', () => {
    const result = documentSchema.parse({ ...validDocument, title: null, mimeType: null });
    expect(result.title).toBeNull();
    expect(result.mimeType).toBeNull();
  });

  it('rejects missing required id', () => {
    const { id: _, ...noId } = validDocument;
    expect(documentSchema.safeParse(noId).success).toBe(false);
  });

  it('rejects invalid uuid for id', () => {
    expect(documentSchema.safeParse({ ...validDocument, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects invalid uuid for syncTargetId', () => {
    expect(documentSchema.safeParse({ ...validDocument, syncTargetId: 'bad' }).success).toBe(false);
  });

  it('rejects empty sourceKey', () => {
    expect(documentSchema.safeParse({ ...validDocument, sourceKey: '' }).success).toBe(false);
  });

  it('rejects non-integer fileSize', () => {
    expect(documentSchema.safeParse({ ...validDocument, fileSize: 1.5 }).success).toBe(false);
  });

  it('rejects non-integer chunkCount', () => {
    expect(documentSchema.safeParse({ ...validDocument, chunkCount: 3.7 }).success).toBe(false);
  });

  it('rejects non-integer pageCount', () => {
    expect(documentSchema.safeParse({ ...validDocument, pageCount: 2.5 }).success).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const { createdAt: _, ...noDate } = validDocument;
    expect(documentSchema.safeParse(noDate).success).toBe(false);
  });

  it('rejects missing updatedAt', () => {
    const { updatedAt: _, ...noDate } = validDocument;
    expect(documentSchema.safeParse(noDate).success).toBe(false);
  });
});
