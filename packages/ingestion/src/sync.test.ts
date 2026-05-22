import { describe, expect, it } from 'vitest';

import type { SourceObject } from './providers/types';
import { computeSyncDiff } from './sync';

function makeSource(key: string, etag = 'etag-1'): SourceObject {
  return { key, etag, size: 100, lastModified: new Date() };
}

function makeExisting(
  id: string,
  sourceKey: string,
  sourceEtag: string | null = 'etag-1',
  status = 'ready',
  searchMetaDirty = false,
) {
  return { id, sourceKey, sourceEtag, status, searchMetaDirty };
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

  it('retries error documents even with matching etag', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'error')];
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

  it('returns empty metaRefreshFiles for empty inputs', () => {
    const result = computeSyncDiff([], []);
    expect(result.metaRefreshFiles).toEqual([]);
  });

  it('puts searchMetaDirty docs with matching etag into metaRefreshFiles', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready', true)];
    const result = computeSyncDiff(source, existing);
    expect(result.metaRefreshFiles).toHaveLength(1);
    expect(result.metaRefreshFiles[0].id).toBe('doc-1');
    expect(result.updatedFiles).toHaveLength(0);
    expect(result.newFiles).toHaveLength(0);
  });

  it('puts searchMetaDirty docs with differing etag into updatedFiles (content change takes priority)', () => {
    const source = [makeSource('file-a.pdf', 'etag-2')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready', true)];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.updatedFiles[0].key).toBe('file-a.pdf');
    expect(result.metaRefreshFiles).toHaveLength(0);
  });

  it('puts searchMetaDirty docs into updatedFiles when force=true (force takes priority)', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready', true)];
    const result = computeSyncDiff(source, existing, { force: true });
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.metaRefreshFiles).toHaveLength(0);
  });

  it('puts searchMetaDirty docs with error status into updatedFiles (retry takes priority)', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'error', true)];
    const result = computeSyncDiff(source, existing);
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.metaRefreshFiles).toHaveLength(0);
  });

  it('skips docs with searchMetaDirty=false and matching etag as before', () => {
    const source = [makeSource('file-a.pdf', 'etag-1')];
    const existing = [makeExisting('doc-1', 'file-a.pdf', 'etag-1', 'ready', false)];
    const result = computeSyncDiff(source, existing);
    expect(result.newFiles).toHaveLength(0);
    expect(result.updatedFiles).toHaveLength(0);
    expect(result.metaRefreshFiles).toHaveLength(0);
    expect(result.deletedDocumentIds).toHaveLength(0);
  });

  it('handles mixed scenario with metaRefreshFiles alongside other categories', () => {
    const source = [
      makeSource('new.pdf', 'etag-new'),
      makeSource('dirty.pdf', 'etag-same'),
      makeSource('changed.pdf', 'etag-changed'),
      makeSource('unchanged.pdf', 'etag-same'),
    ];
    const existing = [
      makeExisting('doc-dirty', 'dirty.pdf', 'etag-same', 'ready', true),
      makeExisting('doc-changed', 'changed.pdf', 'etag-old', 'ready', false),
      makeExisting('doc-unchanged', 'unchanged.pdf', 'etag-same', 'ready', false),
      makeExisting('doc-removed', 'removed.pdf', 'etag-x', 'ready', false),
    ];
    const result = computeSyncDiff(source, existing);
    expect(result.newFiles.map((f) => f.key)).toEqual(['new.pdf']);
    expect(result.updatedFiles.map((f) => f.key)).toEqual(['changed.pdf']);
    expect(result.metaRefreshFiles.map((f) => f.id)).toEqual(['doc-dirty']);
    expect(result.deletedDocumentIds).toEqual(['doc-removed']);
  });
});
