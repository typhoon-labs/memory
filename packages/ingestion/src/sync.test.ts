import { describe, expect, it } from 'vitest';

import type { SourceObject } from './providers/types';
import { computeSyncDiff } from './sync';

function makeSource(key: string, etag = 'etag-1'): SourceObject {
  return { key, etag, size: 100, lastModified: new Date() };
}

function makeExisting(id: string, sourceKey: string, sourceEtag: string | null = 'etag-1', status = 'ready') {
  return { id, sourceKey, sourceEtag, status };
}

describe('computeSyncDiff', () => {
  it('returns empty diff for empty inputs', () => {
    const result = computeSyncDiff([], []);
    expect(result.newFiles).toEqual([]);
    expect(result.updatedFiles).toEqual([]);
    expect(result.deletedDocumentIds).toEqual([]);
  });

  it('detects new files', () => {
    const source = [makeSource('file-a.pdf'), makeSource('file-b.pdf')];
    const result = computeSyncDiff(source, []);
    expect(result.newFiles).toHaveLength(2);
    expect(result.newFiles.map((f) => f.key)).toEqual(['file-a.pdf', 'file-b.pdf']);
    expect(result.updatedFiles).toHaveLength(0);
    expect(result.deletedDocumentIds).toHaveLength(0);
  });

  it('detects updated files when etag changes', () => {
    const source = [makeSource('file-a.pdf', 'etag-2')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1')];
    const result = computeSyncDiff(source, existing);
    expect(result.newFiles).toHaveLength(0);
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.updatedFiles[0].key).toBe('file-a.pdf');
  });

  it('skips unchanged files', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready')];
    const result = computeSyncDiff(source, existing);
    expect(result.newFiles).toHaveLength(0);
    expect(result.updatedFiles).toHaveLength(0);
    expect(result.deletedDocumentIds).toHaveLength(0);
  });

  it('detects deleted files', () => {
    const existing = [makeExisting('doc-1', 'file-a.pdf'), makeExisting('doc-2', 'file-b.pdf')];
    const result = computeSyncDiff([], existing);
    expect(result.deletedDocumentIds).toEqual(['doc-1', 'doc-2']);
  });

  it('does not mark already-deleted docs for deletion', () => {
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'deleted')];
    const result = computeSyncDiff([], existing);
    expect(result.deletedDocumentIds).toHaveLength(0);
  });

  it('retries parse_error documents even with matching etag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'parse_error')];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
  });

  it('retries embed_error documents even with matching etag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'embed_error')];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
  });

  it('retries deleted-status documents even with matching etag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'deleted')];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
  });

  it('force mode puts all matching files into updatedFiles', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready')];
    const result = computeSyncDiff(source, existing, { force: true });
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.newFiles).toHaveLength(0);
  });

  it('handles mixed scenario: new, updated, unchanged, deleted', () => {
    const source = [
      makeSource('new.pdf', 'etag-new'),
      makeSource('updated.pdf', 'etag-changed'),
      makeSource('unchanged.pdf', 'etag-same'),
    ];
    const existing = [
      makeExisting('doc-updated', 'updated.pdf', 'etag-old', 'ready'),
      makeExisting('doc-unchanged', 'unchanged.pdf', 'etag-same', 'ready'),
      makeExisting('doc-removed', 'removed.pdf', 'etag-x', 'ready'),
    ];
    const result = computeSyncDiff(source, existing);
    expect(result.newFiles.map((f) => f.key)).toEqual(['new.pdf']);
    expect(result.updatedFiles.map((f) => f.key)).toEqual(['updated.pdf']);
    expect(result.deletedDocumentIds).toEqual(['doc-removed']);
  });

  it('updates when existing doc has null sourceEtag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', null, 'ready')];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
  });

  it('does not retry processing or pending status docs with matching etag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1'), makeSource('file-b.pdf', 'etag-1')];
    const existing = [
      makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'processing'),
      makeExisting('doc-2', 'file-b.pdf', 'etag-1', 'pending'),
    ];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(0);
  });

  it('force mode still classifies new files as new, not updated', () => {
    const source = [makeSource('new.pdf', 'etag-1'), makeSource('existing.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'existing.pdf', 'etag-1', 'ready')];
    const result = computeSyncDiff(source, existing, { force: true });
    expect(result.newFiles.map((f) => f.key)).toEqual(['new.pdf']);
    expect(result.updatedFiles.map((f) => f.key)).toEqual(['existing.pdf']);
  });
});
