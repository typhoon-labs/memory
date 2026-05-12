import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Mocks ----------

const {
  mockProcessFile,
  mockDeleteDocumentVectors,
  mockExtractMetadataFromContent,
  mockGetProvider,
  mockWithTimeout,
  mockIsUnrecoverable,
  mockAsUnrecoverable,
  mockResolveTemplateSchema,
  mockApplySchemaDefaults,
  mockIsSyncJobCancelled,
  mockIncrementSyncJobCompletion,
} = vi.hoisted(() => ({
  mockProcessFile: vi.fn(),
  mockDeleteDocumentVectors: vi.fn(),
  mockExtractMetadataFromContent: vi.fn(async () => ({})),
  mockGetProvider: vi.fn(),
  mockWithTimeout: vi.fn((p: Promise<unknown>) => p),
  mockIsUnrecoverable: vi.fn(() => false),
  mockAsUnrecoverable: vi.fn((err: unknown) => err),
  mockResolveTemplateSchema: vi.fn(() => ({})),
  mockApplySchemaDefaults: vi.fn(() => ({})),
  mockIsSyncJobCancelled: vi.fn(async () => false),
  mockIncrementSyncJobCompletion: vi.fn(async () => {}),
}));

vi.mock('@typhoon/db', () => ({
  documents: 'documents',
  syncTargets: 'syncTargets',
  metadataTemplates: 'metadataTemplates',
  metadataFieldGroups: 'metadataFieldGroups',
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  inArray: vi.fn((_col: unknown, vals: unknown) => vals),
}));

vi.mock('../pipeline', () => ({
  processFile: mockProcessFile,
  deleteDocumentVectors: mockDeleteDocumentVectors,
  extractMetadataFromContent: mockExtractMetadataFromContent,
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
  resolveTemplateSchema: mockResolveTemplateSchema,
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

function makeDb(targetRow?: Record<string, unknown> | null, docRow?: Record<string, unknown> | null) {
  const row = targetRow === null ? undefined : (targetRow ?? { id: 'st-1', config: { bucket: 'b' } });
  const doc = docRow === null ? undefined : (docRow ?? { id: 'doc-1', customMetadata: {} });
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: string) => ({
        where: vi.fn(async () => {
          if (table === 'documents') return doc ? [doc] : [];
          if (table === 'metadataTemplates') return [];
          if (table === 'metadataFieldGroups') return [];
          return row ? [row] : [];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    })),
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
    mockProcessFile.mockResolvedValue({ title: 'Report', description: 'A report', chunkCount: 5 });
    mockWithTimeout.mockImplementation((p: Promise<unknown>) => p);
    mockIsUnrecoverable.mockReturnValue(false);
  });

  it('happy path: downloads, processes, and updates status to ready', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    // Verifies download was called
    expect(mockGetProvider).toHaveBeenCalledWith('s3');
    expect(mockProvider.download).toHaveBeenCalledWith({ bucket: 'b' }, 'docs/report.pdf', 'test-source');

    // Verifies processFile was called with content
    expect(mockProcessFile).toHaveBeenCalledTimes(1);
    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.documentId).toBe('doc-1');
    expect(pfArgs.syncTargetId).toBe('st-1');

    // Verifies status updated to 'ready'
    expect(db.update).toHaveBeenCalled();
    const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.status).toBe('ready');
    expect(setArg.title).toBe('Report');
    expect(setArg.chunkCount).toBe(5);
  });

  it('calls job.updateProgress with stage names', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    expect(job.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'download' }));
  });

  it('deletes old vectors when isUpdate=true', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob({ isUpdate: true }) as any;
    const db = makeDb();
    const vectorStore = {};

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, vectorStore as any);

    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(vectorStore, 'doc-1');
    expect(job.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'vectorDelete' }));
  });

  it('does NOT delete vectors when isUpdate=false', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob({ isUpdate: false }) as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    expect(mockDeleteDocumentVectors).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError when sync target not found', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb(null); // no rows returned

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await expect(handleProcessFileJob(job, db as any, {} as any)).rejects.toThrow('Sync target not found: st-1');
  });

  it('sets parse_error status and re-throws on recoverable error', async () => {
    const downloadError = new Error('Connection reset');
    mockProvider.download.mockRejectedValue(downloadError);
    mockIsUnrecoverable.mockReturnValue(false);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await expect(handleProcessFileJob(job, db as any, {} as any)).rejects.toThrow('Connection reset');

    // Status should be set to parse_error
    expect(db.update).toHaveBeenCalled();
    const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.status).toBe('parse_error');
    expect(setArg.errorMessage).toBe('Connection reset');
  });

  it('wraps with asUnrecoverable when isUnrecoverable returns true', async () => {
    const permanentError = new Error('404 Not Found');
    mockProvider.download.mockRejectedValue(permanentError);
    mockIsUnrecoverable.mockReturnValue(true);
    mockAsUnrecoverable.mockReturnValue(permanentError);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await expect(handleProcessFileJob(job, db as any, {} as any)).rejects.toThrow('404 Not Found');

    expect(mockIsUnrecoverable).toHaveBeenCalledWith(permanentError);
    expect(mockAsUnrecoverable).toHaveBeenCalledWith(permanentError, 'process-file');
  });

  it('handles non-Error thrown values in catch block', async () => {
    mockProvider.download.mockRejectedValue('string error');

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await expect(handleProcessFileJob(job, db as any, {} as any)).rejects.toBe('string error');

    const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.errorMessage).toBe('string error');
  });

  it('wraps download with withTimeout using STAGE_TIMEOUTS.download', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    const db = makeDb();

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    // withTimeout called with the download promise, 60000ms timeout, and 'download' label
    expect(mockWithTimeout).toHaveBeenCalledWith(expect.anything(), 60_000, 'download');
  });

  it('defaults customMetadata to {} when sync target has no metadataTemplateId', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    // Sync target without metadataTemplateId
    const db = makeDb({ id: 'st-1', config: { bucket: 'b' } });

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.customMetadata).toEqual({});
  });

  it('passes customMetadata through to processFile', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const job = makeJob() as any;
    // Document with existing customMetadata, sync target without template
    const db = makeDb(
      { id: 'st-1', config: { bucket: 'b' } },
      { id: 'doc-1', customMetadata: { department: 'sales' } },
    );

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await handleProcessFileJob(job, db as any, {} as any);

    const pfArgs = mockProcessFile.mock.calls[0][0];
    expect(pfArgs.customMetadata).toEqual({ department: 'sales' });
  });
});
