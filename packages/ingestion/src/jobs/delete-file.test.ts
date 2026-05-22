import { describe, expect, it, vi } from 'vitest';

vi.mock('../pipeline.js', () => ({
  deleteDocumentVectors: vi.fn(async () => {}),
}));
vi.mock('../providers/index.js', () => ({
  getProvider: vi.fn(),
}));
vi.mock('../util/classify-error.js', () => ({
  isUnrecoverable: vi.fn(() => false),
  asUnrecoverable: vi.fn((err) => err),
}));
vi.mock('../util/with-timeout.js', () => ({
  withTimeout: vi.fn((p) => p),
}));

import { deleteDocumentVectors } from '../pipeline';
import { getProvider } from '../providers/index';
import { handleDeleteFileJob } from './delete-file';

function mockRepos(target?: Record<string, unknown> | null) {
  return {
    syncTargetRepo: {
      findById: vi.fn(async () => target ?? null),
    },
    syncJobRepo: {
      findStatusById: vi.fn(async () => 'running'),
      incrementCompletion: vi.fn(async () => null),
      markCompleted: vi.fn(async () => {}),
    },
    documentRepo: {
      markDeleted: vi.fn(async () => {}),
    },
    metadataRepo: {
      resolveEffectiveSchema: vi.fn(async () => null),
    },
  };
}

function mockJob(data = { documentId: 'doc-1', sourceKey: undefined, sourceType: undefined, syncTargetId: undefined }) {
  return { data, updateProgress: vi.fn() };
}

describe('handleDeleteFileJob', () => {
  it('deletes vectors and updates document status', async () => {
    const repos = mockRepos();
    const vectorStore = {};
    const job = mockJob();
    await handleDeleteFileJob(job as never, repos as never, vectorStore as never);
    expect(deleteDocumentVectors).toHaveBeenCalledWith(vectorStore, 'doc-1');
    expect(repos.documentRepo.markDeleted).toHaveBeenCalledWith('doc-1');
  });

  it('skips source deletion when no source info', async () => {
    const repos = mockRepos();
    const job = mockJob();
    await handleDeleteFileJob(job as never, repos as never, {} as never);
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('attempts source deletion when source info provided', async () => {
    const mockDeleteObj = vi.fn(async () => {});
    vi.mocked(getProvider).mockReturnValue({ deleteObject: mockDeleteObj } as never);
    const repos = mockRepos({ id: 'st-1', config: {}, source: 'src' });
    const job = mockJob({
      documentId: 'doc-1',
      sourceKey: 'file.pdf',
      sourceType: 's3',
      syncTargetId: 'st-1',
    } as never);
    await handleDeleteFileJob(job as never, repos as never, {} as never);
    expect(mockDeleteObj).toHaveBeenCalled();
  });

  it('does not fail job when source deletion fails', async () => {
    vi.mocked(getProvider).mockReturnValue({
      deleteObject: vi.fn(async () => {
        throw new Error('S3 error');
      }),
    } as never);
    const repos = mockRepos({ id: 'st-1', config: {}, source: null });
    const job = mockJob({
      documentId: 'doc-1',
      sourceKey: 'file.pdf',
      sourceType: 's3',
      syncTargetId: 'st-1',
    } as never);
    await expect(handleDeleteFileJob(job as never, repos as never, {} as never)).resolves.not.toThrow();
  });

  it('skips source deletion when provider has no deleteObject', async () => {
    vi.mocked(getProvider).mockReturnValue({} as never);
    const repos = mockRepos({ id: 'st-1', config: {}, source: null });
    const job = mockJob({
      documentId: 'doc-1',
      sourceKey: 'file.pdf',
      sourceType: 's3',
      syncTargetId: 'st-1',
    } as never);
    await expect(handleDeleteFileJob(job as never, repos as never, {} as never)).resolves.not.toThrow();
  });
});
