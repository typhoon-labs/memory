import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}));

vi.mock('@typhoon/ui', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

import {
  useBulkDeleteDocuments,
  useBulkUpdateMetadata,
  useDeleteDocument,
  useMoveDocument,
  useResyncDocument,
  useRetryDocument,
  useUpdateDocumentMetadata,
} from './use-document-mutations';

describe('useDeleteDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteDocument() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('doc-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1', { method: 'DELETE' });
  });

  it('invalidates documents.all and syncTargets browse on success', () => {
    const config = useDeleteDocument() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
  });
});

describe('useRetryDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to retry endpoint', async () => {
    const config = useRetryDocument() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('doc-2');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-2/retry', { method: 'POST' });
  });

  it('invalidates documents.all on success', () => {
    const config = useRetryDocument() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
  });
});

describe('useResyncDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to resync endpoint', async () => {
    const config = useResyncDocument() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('doc-3');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-3/resync', { method: 'POST' });
  });

  it('invalidates documents.all and syncTargets browse on success', () => {
    const config = useResyncDocument() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
  });
});

describe('useBulkDeleteDocuments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and ids payload', async () => {
    const config = useBulkDeleteDocuments() as unknown as {
      mutationFn: (ids: string[]) => Promise<unknown>;
    };
    await config.mutationFn(['doc-1', 'doc-2']);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['doc-1', 'doc-2'] }),
    });
  });

  it('invalidates documents.all and syncTargets browse on success', () => {
    const config = useBulkDeleteDocuments() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
  });
});

describe('useUpdateDocumentMetadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH and metadata body', async () => {
    const config = useUpdateDocumentMetadata() as unknown as {
      mutationFn: (data: { id: string; title?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'doc-1', title: 'New Title' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
    });
  });

  it('invalidates detail and all on success', () => {
    const config = useUpdateDocumentMetadata() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'doc-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.documents.detail('doc-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
  });
});

describe('useBulkUpdateMetadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and bulk metadata payload', async () => {
    const config = useBulkUpdateMetadata() as unknown as {
      mutationFn: (data: { ids: string[]; customMetadata: Record<string, unknown> }) => Promise<unknown>;
    };
    const input = { ids: ['doc-1'], customMetadata: { region: 'US' } };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/bulk-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates documents.all on success', () => {
    const config = useBulkUpdateMetadata() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
  });
});

describe('useMoveDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to move endpoint', async () => {
    const config = useMoveDocument() as unknown as {
      mutationFn: (data: { id: string; newSourceKey: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'doc-1', newSourceKey: 'new/path.pdf' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });
  });

  it('invalidates documents.all and syncTargets browse on success', () => {
    const config = useMoveDocument() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
  });
});

describe('syncTargets browse predicate', () => {
  it('predicate returns true when queryKey includes browse', () => {
    // Extract the predicate from any mutation that passes one
    const config = useDeleteDocument() as unknown as { onSuccess: () => void };
    config.onSuccess();

    const call = invalidateQueries.mock.calls.find((c: unknown[]) => (c[0] as { predicate?: unknown }).predicate);
    expect(call).toBeDefined();
    const predicate = ((call ?? [])[0] as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate;

    expect(predicate({ queryKey: ['sync-targets', 'st-1', 'browse'] })).toBe(true);
    expect(predicate({ queryKey: ['sync-targets', 'st-1', 'jobs'] })).toBe(false);
  });
});
