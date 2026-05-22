import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Mocks ----------

const {
  mockProcessFile,
  mockDeleteDocumentVectors,
  mockGetProvider,
  mockWithTimeout,
  mockIsUnrecoverable,
  mockAsUnrecoverable,
  mockApplySchemaDefaults,
  mockIsSyncJobCancelled,
  mockIncrementSyncJobCompletion,
} = vi.hoisted(() => ({
  mockProcessFile: vi.fn(),
  mockDeleteDocumentVectors: vi.fn(),
  mockGetProvider: vi.fn(),
  mockWithTimeout: vi.fn((p: Promise<unknown>) => p),
  mockIsUnrecoverable: vi.fn(() => false),
  mockAsUnrecoverable: vi.fn((err: unknown) => err),
  mockApplySchemaDefaults: vi.fn(() => ({})),
  mockIsSyncJobCancelled: vi.fn(async () => false),
  mockIncrementSyncJobCompletion: vi.fn(async () => {}),
}));

vi.mock('../pipeline', () => ({
  processFile: mockProcessFile,
  deleteDocumentVectors: mockDeleteDocumentVectors,
}));

vi.mock('../providers/index', () => ({
  getProvider: mockGetProvider,
}));

vi.mock('../util/with-timeout', () => ({
  withTimeout: mockWithTimeout,
}));

vi.mock('../util/classify-error', () => ({
  isUnrecoverable: mockIsUnrecoverable,
  asUnrecoverable: mockAsUnrecoverable,
}));

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
}));

vi.mock('@typhoon/types', () => ({
  applySchemaDefaults: mockApplySchemaDefaults,
}));

vi.mock('./check-cancelled', () => ({
  isSyncJobCancelled: mockIsSyncJobCancelled,
}));

vi.mock('./complete-sync-job', () => ({
  incrementSyncJobCompletion: mockIncrementSyncJobCompletion,
}));

import { guessMimeType, handleProcessFileJob } from './process-file';

// ---------- Helpers ----------

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      documentId: 'doc-1',
      sourceKey: 'docs/report.pdf',
      sourceType: 's3',
      sourceName: 'test-source',
      isUpdate: false,
      syncTargetId: 'st-1',
      ...overrides,
    },
    updateProgress: vi.fn(),
  };
}

function makeRepos(targetRow?: Record<string, unknown> | null, docRow?: Record<string, unknown> | null) {
  const target = targetRow === null ? null : (targetRow ?? { id: 'st-1', config: { bucket: 'b' } });
  const doc = docRow === null ? null : (docRow ?? { id: 'doc-1', customMetadata: {} });
  return {
    syncTargetRepo: {
      findById: vi.fn(async () => target),
    },
    syncJobRepo: {
      findStatusById: vi.fn(async () => 'running'),
      incrementCompletion: vi.fn(async () => null),
      markCompleted: vi.fn(async () => {}),
    },
    documentRepo: {
      findById: vi.fn(async () => doc),
      markReady: vi.fn(async () => null),
      markError: vi.fn(async () => {}),
      clearSearchMetaDirty: vi.fn(async () => {}),
    },
    metadataRepo: {
      resolveEffectiveSchema: vi.fn(async () => null),
    },
  };
}

const mockProvider = {
  download: vi.fn(async () => Buffer.from('file-content')),
  list: vi.fn(),
};

// ---------- Tests: guessMimeType ----------

describe('guessMimeType', () => {
  it('returns application/pdf for .pdf', () => {
    expect(guessMimeType('document.pdf')).toBe('application/pdf');
  });

  it('returns correct MIME for .docx', () => {
    expect(guessMimeType('file.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('returns correct MIME for .xlsx', () => {
    expect(guessMimeType('data.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('returns text/markdown for .md', () => {
    expect(guessMimeType('readme.md')).toBe('text/markdown');
  });

  it('returns text/html for .html and .htm', () => {
    expect(guessMimeType('page.html')).toBe('text/html');
    expect(guessMimeType('page.htm')).toBe('text/html');
  });

  it('returns text/plain for .txt', () => {
    expect(guessMimeType('notes.txt')).toBe('text/plain');
  });

  it('returns application/json for .json', () => {
    expect(guessMimeType('config.json')).toBe('application/json');
  });

  it('returns text/csv for .csv', () => {
    expect(guessMimeType('data.csv')).toBe('text/csv');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(guessMimeType('file.xyz')).toBe('application/octet-stream');
  });

  it('handles case-insensitive extensions', () => {
    expect(guessMimeType('FILE.PDF')).toBe('application/pdf');
  });

  it('handles files with no extension', () => {
    expect(guessMimeType('README')).toBe('application/octet-stream');
  });

  it('handles multi-dot filenames', () => {
    expect(guessMimeType('archive.2024.pdf')).toBe('application/pdf');
  });
});

// ---------- Tests: handleProcessFileJob ----------

describe('handleProcessFileJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProvider.mockReturnValue(mockProvider);
    mockProvider.download.mockResolvedValue(Buffer.from('file-content'));
    mockProcessFile.mockResolvedValue({ title: 'Report', description: 'A report', chunkCount: 5, customMetadata: {} });
    mockWithTimeout.mockImplementation((p: Promise<unknown>) => p);
    mockIsUnrecoverable.mockReturnValue(false);
  });

  it('happy path: downloads, processes, and updates status to ready', async () => {
    const job = makeJob() as any;
    const repos = makeRepos();

    await handleProcessFileJob(job, repos as any, {} as any);

    // Verifies download was called
    expect(mockGetProvider).toHaveBeenCalledWith('s3');
    expect(mockProvider.download).toHaveBeenCalledWith({ bucket: 'b' }, 'docs/report.pdf', 'test-source');

    // Verifies processFile was called with content
    expect(mockProcessFile).toHaveBeenCalledTimes(1);
    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.documentId).toBe('doc-1');
    expect(pfArgs.syncTargetId).toBe('st-1');

    // Verifies status updated to 'ready' via markReady
    expect(repos.documentRepo.markReady).toHaveBeenCalledWith('doc-1', {
      title: 'Report',
      description: 'A report',
      chunkCount: 5,
      customMetadata: {},
      mimeType: 'application/pdf',
    });
  });

  it('calls job.updateProgress with stage names', async () => {
    const job = makeJob() as any;
    const repos = makeRepos();

    await handleProcessFileJob(job, repos as any, {} as any);

    expect(job.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'download' }));
  });

  it('deletes old vectors when isUpdate=true', async () => {
    const job = makeJob({ isUpdate: true }) as any;
    const repos = makeRepos();
    const vectorStore = {};

    await handleProcessFileJob(job, repos as any, vectorStore as any);

    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(vectorStore, 'doc-1');
    expect(job.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'vectorDelete' }));
  });

  it('does NOT delete vectors when isUpdate=false', async () => {
    const job = makeJob({ isUpdate: false }) as any;
    const repos = makeRepos();

    await handleProcessFileJob(job, repos as any, {} as any);

    expect(mockDeleteDocumentVectors).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError when sync target not found', async () => {
    const job = makeJob() as any;
    const repos = makeRepos(null); // no target

    await expect(handleProcessFileJob(job, repos as any, {} as any)).rejects.toThrow('Sync target not found: st-1');
  });

  it('sets error status and re-throws on recoverable error', async () => {
    const downloadError = new Error('Connection reset');
    mockProvider.download.mockRejectedValue(downloadError);
    mockIsUnrecoverable.mockReturnValue(false);

    const job = makeJob() as any;
    const repos = makeRepos();

    await expect(handleProcessFileJob(job, repos as any, {} as any)).rejects.toThrow('Connection reset');

    // Status should be set to error
    expect(repos.documentRepo.markError).toHaveBeenCalledWith('doc-1', expect.stringContaining('Connection reset'));
  });

  it('wraps with asUnrecoverable when isUnrecoverable returns true', async () => {
    const permanentError = new Error('404 Not Found');
    mockProvider.download.mockRejectedValue(permanentError);
    mockIsUnrecoverable.mockReturnValue(true);
    mockAsUnrecoverable.mockReturnValue(permanentError);

    const job = makeJob() as any;
    const repos = makeRepos();

    await expect(handleProcessFileJob(job, repos as any, {} as any)).rejects.toThrow('404 Not Found');

    expect(mockIsUnrecoverable).toHaveBeenCalledWith(permanentError);
    expect(mockAsUnrecoverable).toHaveBeenCalledWith(permanentError, 'process-file');
  });

  it('handles non-Error thrown values in catch block', async () => {
    mockProvider.download.mockRejectedValue('string error');

    const job = makeJob() as any;
    const repos = makeRepos();

    await expect(handleProcessFileJob(job, repos as any, {} as any)).rejects.toBe('string error');

    expect(repos.documentRepo.markError).toHaveBeenCalledWith('doc-1', expect.stringContaining('string error'));
  });

  it('wraps download with withTimeout using STAGE_TIMEOUTS.download', async () => {
    const job = makeJob() as any;
    const repos = makeRepos();

    await handleProcessFileJob(job, repos as any, {} as any);

    // withTimeout called with the download promise, 60000ms timeout, and 'download' label
    expect(mockWithTimeout).toHaveBeenCalledWith(expect.anything(), 60_000, 'download');
  });

  it('defaults customMetadata to {} when sync target has no metadataTemplateId', async () => {
    const job = makeJob() as any;
    // Sync target without metadataTemplateId
    const repos = makeRepos({ id: 'st-1', config: { bucket: 'b' } });

    await handleProcessFileJob(job, repos as any, {} as any);

    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.customMetadata).toEqual({});
  });

  it('passes customMetadata through to processFile', async () => {
    const job = makeJob() as any;
    // Document with existing customMetadata, sync target without template
    const repos = makeRepos(
      { id: 'st-1', config: { bucket: 'b' } },
      { id: 'doc-1', customMetadata: { department: 'sales' } },
    );

    await handleProcessFileJob(job, repos as any, {} as any);

    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.customMetadata).toEqual({ department: 'sales' });
  });

  it('returns undefined when there are no warnings', async () => {
    const job = makeJob() as any;
    const repos = makeRepos();

    const result = await handleProcessFileJob(job, repos as any, {} as any);
    expect(result).toBeUndefined();
  });

  it('saves result.customMetadata from processFile to the document', async () => {
    mockProcessFile.mockResolvedValueOnce({
      title: 'Report',
      description: 'A report',
      chunkCount: 5,
      customMetadata: { department: 'sales', region: 'us' },
    });
    const job = makeJob() as any;
    const repos = makeRepos();

    await handleProcessFileJob(job, repos as any, {} as any);

    expect(repos.documentRepo.markReady).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({
        customMetadata: { department: 'sales', region: 'us' },
      }),
    );
  });
});
