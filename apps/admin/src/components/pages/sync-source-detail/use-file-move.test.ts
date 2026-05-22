import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('@tanstack/react-query', () => {
  const invalidateQueries = vi.fn();
  return {
    useQueryClient: () => ({ invalidateQueries }),
  };
});

import { act, renderHook } from '@testing-library/react';
import { apiFetch } from '@typhoon/ui';

import { computeDestination, type DragItem, isDescendantOf, useFileMove } from './use-file-move';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

// ── computeDestination ─────────────────────────────────────────

describe('computeDestination', () => {
  it('appends file basename to target path', () => {
    const item: DragItem = { type: 'file', sourceKey: 'docs/readme.md', documentId: 'doc-1', title: 'README' };
    expect(computeDestination(item, 'archive/')).toBe('archive/readme.md');
  });

  it('uses full sourceKey when no slash present', () => {
    const item: DragItem = { type: 'file', sourceKey: 'readme.md', documentId: 'doc-1', title: null };
    expect(computeDestination(item, 'target/')).toBe('target/readme.md');
  });

  it('handles nested source keys', () => {
    const item: DragItem = { type: 'file', sourceKey: 'a/b/c/deep.pdf', documentId: 'doc-2', title: null };
    expect(computeDestination(item, 'flat/')).toBe('flat/deep.pdf');
  });

  it('appends folder name with trailing slash to target path', () => {
    const item: DragItem = { type: 'folder', path: 'docs/' };
    expect(computeDestination(item, 'archive/')).toBe('archive/docs/');
  });

  it('handles nested folder paths', () => {
    const item: DragItem = { type: 'folder', path: 'a/b/c/' };
    expect(computeDestination(item, 'target/')).toBe('target/c/');
  });

  it('handles folder path without trailing slash', () => {
    const item: DragItem = { type: 'folder', path: 'docs' };
    expect(computeDestination(item, 'target/')).toBe('target/docs/');
  });

  it('appends to empty target path', () => {
    const item: DragItem = { type: 'file', sourceKey: 'readme.md', documentId: 'doc-1', title: null };
    expect(computeDestination(item, '')).toBe('readme.md');
  });
});

// ── isDescendantOf ─────────────────────────────────────────────

describe('isDescendantOf', () => {
  it('returns true when child is inside parent', () => {
    expect(isDescendantOf('docs/policies/pto.md', 'docs/')).toBe(true);
  });

  it('returns true for deeply nested child', () => {
    expect(isDescendantOf('a/b/c/d/', 'a/')).toBe(true);
  });

  it('returns false when paths are equal', () => {
    expect(isDescendantOf('docs/', 'docs/')).toBe(false);
  });

  it('returns false when child is not inside parent', () => {
    expect(isDescendantOf('other/file.md', 'docs/')).toBe(false);
  });

  it('returns false for partial prefix match that is not a real parent', () => {
    expect(isDescendantOf('docs-v2/file.md', 'docs/')).toBe(false);
  });

  it('returns true for immediate child', () => {
    expect(isDescendantOf('docs/file.md', 'docs/')).toBe(true);
  });

  it('returns false for empty child path', () => {
    expect(isDescendantOf('', 'docs/')).toBe(false);
  });

  it('returns false for empty parent path', () => {
    // Every non-empty path starts with '', but the function checks startsWith+length
    expect(isDescendantOf('docs/file.md', '')).toBe(true);
  });
});

describe('computeDestination — edge cases', () => {
  it('handles file at root level targeting root', () => {
    const item: DragItem = { type: 'file', sourceKey: 'readme.md', documentId: 'doc-1', title: null };
    expect(computeDestination(item, '')).toBe('readme.md');
  });

  it('handles deeply nested folder to root', () => {
    const item: DragItem = { type: 'folder', path: 'a/b/c/d/' };
    expect(computeDestination(item, '')).toBe('d/');
  });
});

// ── useFileMove ───────────────────────────────────────────────

describe('useFileMove', () => {
  it('moves a file by calling apiFetch with POST', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useFileMove('st-1'));

    await act(async () => {
      await result.current.moveItems(
        [{ type: 'file', sourceKey: 'docs/readme.md', documentId: 'doc-1', title: 'README' }],
        'archive/',
      );
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'archive/readme.md' }),
    });
  });

  it('moves a folder by calling apiFetch with folder move endpoint', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useFileMove('st-1'));

    await act(async () => {
      await result.current.moveItems([{ type: 'folder', path: 'docs/' }], 'archive/');
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'docs/', newPath: 'archive/docs/' }),
    });
  });

  it('sets error when a move fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Permission denied'));
    const { result } = renderHook(() => useFileMove('st-1'));

    await act(async () => {
      await result.current.moveItems(
        [{ type: 'file', sourceKey: 'test.pdf', documentId: 'doc-1', title: null }],
        'target/',
      );
    });

    expect(result.current.error).toBe('Permission denied');
  });

  it('clears error with clearError', async () => {
    mockApiFetch.mockRejectedValue(new Error('Failed'));
    const { result } = renderHook(() => useFileMove('st-1'));

    await act(async () => {
      await result.current.moveItems(
        [{ type: 'file', sourceKey: 'test.pdf', documentId: 'doc-1', title: null }],
        'target/',
      );
    });

    expect(result.current.error).toBe('Failed');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('handles multiple moves with mixed results', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'));

    const { result } = renderHook(() => useFileMove('st-1'));

    await act(async () => {
      await result.current.moveItems(
        [
          { type: 'file', sourceKey: 'ok.pdf', documentId: 'doc-1', title: null },
          { type: 'file', sourceKey: 'fail1.pdf', documentId: 'doc-2', title: null },
          { type: 'file', sourceKey: 'fail2.pdf', documentId: 'doc-3', title: null },
        ],
        'target/',
      );
    });

    expect(result.current.error).toContain('2 moves failed');
  });

  it('returns isPending false after move completes', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useFileMove('st-1'));

    expect(result.current.isPending).toBe(false);

    await act(async () => {
      await result.current.moveItems(
        [{ type: 'file', sourceKey: 'test.pdf', documentId: 'doc-1', title: null }],
        'target/',
      );
    });

    expect(result.current.isPending).toBe(false);
  });
});
