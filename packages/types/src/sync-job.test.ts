import { describe, expect, it } from 'vitest';

import { syncJobSchema, syncJobStatusEnum } from './sync-job';

// =============================================================================
// syncJobStatusEnum
// =============================================================================

describe('syncJobStatusEnum', () => {
  it.each(['running', 'completed', 'failed'] as const)('parses "%s"', (status) => {
    expect(syncJobStatusEnum.parse(status)).toBe(status);
  });

  it('rejects unknown status', () => {
    expect(syncJobStatusEnum.safeParse('cancelled').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(syncJobStatusEnum.safeParse('').success).toBe(false);
  });
});

// =============================================================================
// syncJobSchema
// =============================================================================

describe('syncJobSchema', () => {
  const validSyncJob = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    syncTargetId: '550e8400-e29b-41d4-a716-446655440001',
    startedAt: new Date('2024-01-01'),
  };

  it('parses minimal valid sync job with defaults', () => {
    const result = syncJobSchema.parse(validSyncJob);
    expect(result.status).toBe('running');
    expect(result.filesScanned).toBe(0);
    expect(result.filesNew).toBe(0);
    expect(result.filesUpdated).toBe(0);
    expect(result.filesDeleted).toBe(0);
    expect(result.filesErrored).toBe(0);
    expect(result.errorMessage).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it('parses a completed sync job', () => {
    const completed = {
      ...validSyncJob,
      status: 'completed' as const,
      filesScanned: 100,
      filesNew: 10,
      filesUpdated: 5,
      filesDeleted: 2,
      filesErrored: 1,
      completedAt: new Date('2024-01-02'),
    };
    const result = syncJobSchema.parse(completed);
    expect(result.status).toBe('completed');
    expect(result.filesScanned).toBe(100);
    expect(result.filesNew).toBe(10);
    expect(result.completedAt).toEqual(new Date('2024-01-02'));
  });

  it('parses a failed sync job with error message', () => {
    const failed = {
      ...validSyncJob,
      status: 'failed' as const,
      errorMessage: 'Connection refused',
      completedAt: new Date('2024-01-02'),
    };
    const result = syncJobSchema.parse(failed);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('Connection refused');
  });

  it('accepts null for nullable fields', () => {
    const result = syncJobSchema.parse({ ...validSyncJob, errorMessage: null, completedAt: null });
    expect(result.errorMessage).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it('rejects invalid uuid for id', () => {
    expect(syncJobSchema.safeParse({ ...validSyncJob, id: 'bad' }).success).toBe(false);
  });

  it('rejects invalid uuid for syncTargetId', () => {
    expect(syncJobSchema.safeParse({ ...validSyncJob, syncTargetId: 'bad' }).success).toBe(false);
  });

  it('rejects non-integer counters', () => {
    expect(syncJobSchema.safeParse({ ...validSyncJob, filesScanned: 1.5 }).success).toBe(false);
    expect(syncJobSchema.safeParse({ ...validSyncJob, filesNew: 2.3 }).success).toBe(false);
    expect(syncJobSchema.safeParse({ ...validSyncJob, filesUpdated: 0.1 }).success).toBe(false);
    expect(syncJobSchema.safeParse({ ...validSyncJob, filesDeleted: 3.14 }).success).toBe(false);
    expect(syncJobSchema.safeParse({ ...validSyncJob, filesErrored: 1.1 }).success).toBe(false);
  });

  it('rejects missing startedAt', () => {
    const { startedAt: _, ...noDate } = validSyncJob;
    expect(syncJobSchema.safeParse(noDate).success).toBe(false);
  });

  it('rejects missing id', () => {
    const { id: _, ...noId } = validSyncJob;
    expect(syncJobSchema.safeParse(noId).success).toBe(false);
  });
});
