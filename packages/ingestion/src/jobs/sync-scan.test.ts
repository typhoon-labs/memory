import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/db', () => ({
  documents: 'documents',
  syncJobs: 'syncJobs',
  syncTargets: 'syncTargets',
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((_col, val) => val) }));
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

function mockDb() {
  const insertReturning = vi.fn(async () => [{ id: 'sj-1' }]);
  const updateReturning = vi.fn(async () => [{ id: 'doc-1' }]);
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: insertReturning,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
        returning: undefined as unknown,
      })),
    })),
    _insertReturning: insertReturning,
    _updateReturning: updateReturning,
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
    const db = mockDb();
    db.select.mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(async () => []) })),
    });
    const queue = mockQueue();
    await handleScanJob(mockJob() as never, db as never, queue as never);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns early for inactive sync target', async () => {
    const db = mockDb();
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ id: 'st-1', isActive: false, name: 'test', sourceType: 's3', config: {} }]),
      })),
    });
    const queue = mockQueue();
    await handleScanJob(mockJob() as never, db as never, queue as never);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues process-file jobs for new files', async () => {
    const db = mockDb();
    // First select: sync target lookup
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({
        where: vi.fn(async () => [
          { id: 'st-1', isActive: true, name: 'test', sourceType: 's3', config: {}, source: 'src' },
        ]),
      })
      .mockReturnValueOnce({ where: vi.fn(async () => []) }); // existing docs
    db.select.mockReturnValue({ from: selectFrom });

    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => []),
    } as never);
    vi.mocked(computeSyncDiff).mockReturnValue({
      newFiles: [{ key: 'new.pdf', etag: 'e1', size: 100, lastModified: new Date() }],
      updatedFiles: [],
      deletedDocumentIds: [],
    });

    const queue = mockQueue();
    await handleScanJob(mockJob() as never, db as never, queue as never);
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
    const db = mockDb();
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({
        where: vi.fn(async () => [
          { id: 'st-1', isActive: true, name: 'test', sourceType: 's3', config: {}, source: null },
        ]),
      })
      .mockReturnValueOnce({ where: vi.fn(async () => []) });
    db.select.mockReturnValue({ from: selectFrom });

    vi.mocked(getProvider).mockReturnValue({ listObjects: vi.fn(async () => []) } as never);
    vi.mocked(computeSyncDiff).mockReturnValue({
      newFiles: [],
      updatedFiles: [],
      deletedDocumentIds: ['doc-del-1'],
    });

    const queue = mockQueue();
    await handleScanJob(mockJob() as never, db as never, queue as never);
    expect(queue.add).toHaveBeenCalledWith(
      'delete-file',
      { documentId: 'doc-del-1', syncJobId: 'sj-1' },
      expect.objectContaining({
        jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      }),
    );
  });

  it('marks syncJob as failed on error', async () => {
    const db = mockDb();
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({
        where: vi.fn(async () => [
          { id: 'st-1', isActive: true, name: 'test', sourceType: 's3', config: {}, source: null },
        ]),
      })
      .mockReturnValueOnce({ where: vi.fn(async () => []) });
    db.select.mockReturnValue({ from: selectFrom });

    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => {
        throw new Error('network fail');
      }),
    } as never);

    const queue = mockQueue();
    await expect(handleScanJob(mockJob() as never, db as never, queue as never)).rejects.toThrow('network fail');
  });

  it('throws UnrecoverableError for permanent failures', async () => {
    const db = mockDb();
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({
        where: vi.fn(async () => [
          { id: 'st-1', isActive: true, name: 'test', sourceType: 's3', config: {}, source: null },
        ]),
      })
      .mockReturnValueOnce({ where: vi.fn(async () => []) });
    db.select.mockReturnValue({ from: selectFrom });

    const permError = new Error('NoSuchBucket');
    vi.mocked(getProvider).mockReturnValue({
      listObjects: vi.fn(async () => {
        throw permError;
      }),
    } as never);
    vi.mocked(isUnrecoverable).mockReturnValue(true);

    const queue = mockQueue();
    await expect(handleScanJob(mockJob() as never, db as never, queue as never)).rejects.toThrow();
  });
});
