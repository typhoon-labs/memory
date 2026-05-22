import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/queue', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/queue')>('@typhoon/queue');
  return actual;
});
vi.mock('../providers/index.js', () => ({
  getProvider: vi.fn(),
}));
vi.mock('../sync.js', () => ({
  computeSyncDiff: vi.fn(),
}));
vi.mock('../util/classify-error.js', () => ({
  isUnrecoverable: vi.fn(() => false),
  asUnrecoverable: vi.fn((err) => err),
}));
vi.mock('../util/with-timeout.js', () => ({
  withTimeout: vi.fn((p) => p),
}));

import { getProvider } from '../providers/index';
import { computeSyncDiff } from '../sync';
import { isUnrecoverable } from '../util/classify-error';
import { handleScanJob } from './sync-scan';

function mockRepos(target?: Record<string, unknown> | null) {
  return {
    syncTargetRepo: {
      findById: vi.fn(async () => target ?? null),
    },
    syncJobRepo: {
      create: vi.fn(async () => ({ id: 'sj-1' })),
      updateStats: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    },
    documentRepo: {
      listBySyncTarget: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'doc-1' })),
      updateForSync: vi.fn(async () => ({ id: 'doc-1' })),
    },
    metadataRepo: {
      resolveEffectiveSchema: vi.fn(async () => null),
    },
  };
}

function mockJob(data = { syncTargetId: 'st-1' }) {
  return { data, updateProgress: vi.fn() };
}

function mockQueue() {
  return { add: vi.fn() };
}

describe('handleScanJob', () => {
  it('returns early for missing sync target', async () => {
    const repos = mockRepos(null);
    const queue = mockQueue();
    await handleScanJob(mockJob() as never, repos as never, queue as never);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns early for inactive sync target', async () => {
    const repos = mockRepos({ id: 'st-1', isActive: false, name: 'test', sourceType: 's3', config: {} });
    const queue = mockQueue();
    await handleScanJob(mockJob() as never, repos as never, queue as never);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues process-file jobs for new files', async () => {
    const repos = mockRepos({
      id: 'st-1',
      isActive: true,
      name: 'test',
      sourceType: 's3',
      config: {},
      source: 'src',
    });

    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => []),
    } as never);
    vi.mocked(computeSyncDiff).mockReturnValue({
      newFiles: [{ key: 'new.pdf', etag: 'e1', size: 100, lastModified: new Date() }],
      updatedFiles: [],
      deletedDocumentIds: [],
      metaRefreshFiles: [],
    });

    const queue = mockQueue();
    await handleScanJob(mockJob() as never, repos as never, queue as never);
    expect(queue.add).toHaveBeenCalledWith(
      'process-file',
      expect.objectContaining({
        sourceKey: 'new.pdf',
        isUpdate: false,
        syncJobId: 'sj-1',
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      }),
    );
  });

  it('enqueues delete-file jobs for deleted files', async () => {
    const repos = mockRepos({
      id: 'st-1',
      isActive: true,
      name: 'test',
      sourceType: 's3',
      config: {},
      source: null,
    });

    vi.mocked(getProvider).mockReturnValue({ listObjects: vi.fn(async () => []) } as never);
    vi.mocked(computeSyncDiff).mockReturnValue({
      newFiles: [],
      updatedFiles: [],
      deletedDocumentIds: ['doc-del-1'],
      metaRefreshFiles: [],
    });

    const queue = mockQueue();
    await handleScanJob(mockJob() as never, repos as never, queue as never);
    expect(queue.add).toHaveBeenCalledWith(
      'delete-file',
      { documentId: 'doc-del-1', syncJobId: 'sj-1' },
      expect.objectContaining({
        jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      }),
    );
  });

  it('marks syncJob as failed on error', async () => {
    const repos = mockRepos({
      id: 'st-1',
      isActive: true,
      name: 'test',
      sourceType: 's3',
      config: {},
      source: null,
    });

    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => {
        throw new Error('network fail');
      }),
    } as never);

    const queue = mockQueue();
    await expect(handleScanJob(mockJob() as never, repos as never, queue as never)).rejects.toThrow('network fail');
    expect(repos.syncJobRepo.markFailed).toHaveBeenCalledWith('sj-1', 'network fail');
  });

  it('enqueues child jobs with demoted priority (not scan priority)', async () => {
    const repos = mockRepos({
      id: 'st-1',
      isActive: true,
      name: 'test',
      sourceType: 's3',
      config: {},
      source: 'src',
    });

    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => []),
    } as never);
    vi.mocked(computeSyncDiff).mockReturnValue({
      newFiles: [{ key: 'file.pdf', etag: 'e1', size: 100, lastModified: new Date() }],
      updatedFiles: [],
      deletedDocumentIds: ['doc-del-1'],
      metaRefreshFiles: [],
    });

    const queue = mockQueue();
    const job = { data: { syncTargetId: 'st-1' }, opts: { priority: 1 }, updateProgress: vi.fn() };
    await handleScanJob(job as never, repos as never, queue as never);

    // process-file child should get CHILD_MANUAL (10), not MANUAL (1)
    expect(queue.add).toHaveBeenCalledWith(
      'process-file',
      expect.anything(),
      expect.objectContaining({ priority: 10 }),
    );
    // delete-file child should also get CHILD_MANUAL (10)
    expect(queue.add).toHaveBeenCalledWith('delete-file', expect.anything(), expect.objectContaining({ priority: 10 }));
  });

  it('throws UnrecoverableError for permanent failures', async () => {
    const repos = mockRepos({
      id: 'st-1',
      isActive: true,
      name: 'test',
      sourceType: 's3',
      config: {},
      source: null,
    });

    const permError = new Error('NoSuchBucket');
    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => {
        throw permError;
      }),
    } as never);
    vi.mocked(isUnrecoverable).mockReturnValue(true);

    const queue = mockQueue();
    await expect(handleScanJob(mockJob() as never, repos as never, queue as never)).rejects.toThrow('NoSuchBucket');
  });
});
