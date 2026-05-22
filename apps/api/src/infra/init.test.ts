import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreateIndex, mockSyncTargetRepo } = vi.hoisted(() => ({
  mockCreateIndex: vi.fn(),
  mockSyncTargetRepo: {
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivateOrphaned: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@typhoon/ai', () => ({
  EMBEDDING_DIMENSION: 1536,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class {
    createIndex = mockCreateIndex;
  },
}));

vi.mock('@typhoon/db/repos', () => ({
  SyncTargetRepo: class {
    constructor() {
      return mockSyncTargetRepo;
    }
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { initVectorIndex, reconcileConfigSyncTargets } from './init';

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initVectorIndex', () => {
  it('calls createIndex with correct params', async () => {
    mockCreateIndex.mockResolvedValue(undefined);

    await initVectorIndex({} as any);

    expect(mockCreateIndex).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      dimension: 1536,
      indexConfig: {
        type: 'hnsw',
        hnsw: { m: 16, efConstruction: 64 },
      },
    });
  });

  it('handles "already exists" error gracefully', async () => {
    mockCreateIndex.mockRejectedValue(new Error('relation "knowledge_base" already exists'));

    await expect(initVectorIndex({} as any)).resolves.toBeUndefined();
  });

  it('re-throws other errors', async () => {
    mockCreateIndex.mockRejectedValue(new Error('connection refused'));

    await expect(initVectorIndex({} as any)).rejects.toThrow('connection refused');
  });
});

describe('reconcileConfigSyncTargets', () => {
  it('returns early for empty array', async () => {
    await reconcileConfigSyncTargets({} as any, []);

    expect(mockSyncTargetRepo.findByName).not.toHaveBeenCalled();
  });

  it('creates new targets when not found', async () => {
    mockSyncTargetRepo.findByName.mockResolvedValue(null);

    await reconcileConfigSyncTargets({} as any, [
      {
        name: 'My Source',
        source: 'prod-s3',
        sourceType: 's3',
        config: { prefix: '' },
        cronSchedule: '0 */6 * * *',
        isActive: true,
      },
    ]);

    expect(mockSyncTargetRepo.findByName).toHaveBeenCalledWith('My Source');
    expect(mockSyncTargetRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Source',
        managedBy: 'config',
        sourceType: 's3',
        source: 'prod-s3',
      }),
    );
    expect(mockSyncTargetRepo.update).not.toHaveBeenCalled();
  });

  it('updates existing targets', async () => {
    mockSyncTargetRepo.findByName.mockResolvedValue({ id: 'existing-id', name: 'My Source' });

    await reconcileConfigSyncTargets({} as any, [
      {
        name: 'My Source',
        source: 'prod-s3',
        sourceType: 's3',
        config: { prefix: 'docs/' },
        cronSchedule: '0 0 * * *',
        isActive: true,
      },
    ]);

    expect(mockSyncTargetRepo.update).toHaveBeenCalledWith(
      'existing-id',
      expect.objectContaining({
        managedBy: 'config',
        config: { prefix: 'docs/' },
        cronSchedule: '0 0 * * *',
      }),
    );
    expect(mockSyncTargetRepo.create).not.toHaveBeenCalled();
  });

  it('handles mixed create and update', async () => {
    mockSyncTargetRepo.findByName
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-id', name: 'Source B' });

    await reconcileConfigSyncTargets({} as any, [
      { name: 'Source A', source: 'a', sourceType: 's3', config: {}, cronSchedule: '0 0 * * *', isActive: true },
      { name: 'Source B', source: 'b', sourceType: 's3', config: {}, cronSchedule: '0 0 * * *', isActive: true },
    ]);

    expect(mockSyncTargetRepo.create).toHaveBeenCalledTimes(1);
    expect(mockSyncTargetRepo.update).toHaveBeenCalledTimes(1);
  });

  it('deactivates orphaned config targets', async () => {
    mockSyncTargetRepo.findByName.mockResolvedValue(null);
    mockSyncTargetRepo.deactivateOrphaned.mockResolvedValue(['Old Source']);

    await reconcileConfigSyncTargets({} as any, [
      { name: 'Current', source: 'x', sourceType: 's3', config: {}, cronSchedule: '0 0 * * *', isActive: true },
    ]);

    expect(mockSyncTargetRepo.deactivateOrphaned).toHaveBeenCalledWith(['Current']);
  });
});
