import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import type { ExperimentServiceDeps } from './experiment.service';
import { ExperimentService } from './experiment.service';

vi.mock('@typhoon/evals', () => ({
  computeCategoryAverages: vi.fn((scores: Array<{ scorerId: string; score: number | null }>) => {
    const validScores = scores.filter((s) => s.score !== null);
    const avg =
      validScores.length > 0 ? validScores.reduce((a, b) => a + (b.score ?? 0), 0) / validScores.length : null;
    return { responseAvg: avg, retrievalAvg: null };
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<ExperimentServiceDeps> = {}): ExperimentServiceDeps {
  return {
    experimentsStorage: {
      listExperiments: vi.fn().mockResolvedValue({ experiments: [], total: 0 }),
      getExperimentById: vi.fn().mockResolvedValue(null),
      createExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'pending' }),
      updateExperiment: vi.fn().mockResolvedValue(undefined),
      deleteExperiment: vi.fn().mockResolvedValue(undefined),
      listExperimentResults: vi.fn().mockResolvedValue({ results: [], total: 0 }),
    } as unknown as ExperimentServiceDeps['experimentsStorage'],
    datasetsStorage: {
      getDatasetById: vi.fn().mockResolvedValue(null),
      listItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as ExperimentServiceDeps['datasetsStorage'],
    experimentQueue: {
      add: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExperimentServiceDeps['experimentQueue'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ExperimentService', () => {
  let deps: ExperimentServiceDeps;
  let service: ExperimentService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new ExperimentService(deps);
  });

  describe('list', () => {
    it('returns experiments from storage', async () => {
      const mockResult = { experiments: [{ id: 'exp-1' }], total: 1 };
      vi.mocked(deps.experimentsStorage.listExperiments).mockResolvedValueOnce(mockResult as never);

      const result = await service.list({ page: 0, perPage: 10 });
      const data = assertOk(result);
      expect(data).toEqual(mockResult);
      expect(deps.experimentsStorage.listExperiments).toHaveBeenCalledWith({
        page: 0,
        perPage: 10,
        status: undefined,
      });
    });

    it('caps perPage at 100', async () => {
      vi.mocked(deps.experimentsStorage.listExperiments).mockResolvedValueOnce({ experiments: [], total: 0 } as never);
      await service.list({ page: 0, perPage: 500 });
      expect(deps.experimentsStorage.listExperiments).toHaveBeenCalledWith(expect.objectContaining({ perPage: 100 }));
    });

    it('passes status filter', async () => {
      vi.mocked(deps.experimentsStorage.listExperiments).mockResolvedValueOnce({ experiments: [], total: 0 } as never);
      await service.list({ status: 'running' });
      expect(deps.experimentsStorage.listExperiments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' }),
      );
    });
  });

  describe('getById', () => {
    it('returns experiment when found', async () => {
      const experiment = { id: 'exp-1', name: 'Test', status: 'completed' };
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce(experiment as never);

      const result = await service.getById('exp-1');
      const data = assertOk(result);
      expect(data).toEqual(experiment);
    });

    it('returns not-found when experiment does not exist', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce(null as never);
      const result = await service.getById('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('create', () => {
    it('creates experiment and enqueues job', async () => {
      const dataset = { id: 'ds-1', version: 3 };
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(dataset as never);
      vi.mocked(deps.datasetsStorage.listItems).mockResolvedValueOnce({ items: [], total: 5 } as never);
      vi.mocked(deps.experimentsStorage.createExperiment).mockResolvedValueOnce({ id: 'exp-new' } as never);

      const result = await service.create({ datasetId: 'ds-1', name: 'My Experiment' });
      assertOk(result);
      expect(deps.experimentsStorage.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'ds-1',
          datasetVersion: 3,
          totalItems: 5,
          name: 'My Experiment',
          status: 'pending',
        }),
      );
      expect(deps.experimentQueue.add).toHaveBeenCalledWith('experiment-setup', { experimentId: 'exp-new' });
    });

    it('returns validation error when datasetId is missing', async () => {
      const result = await service.create({ datasetId: '' });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns dataset-not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.create({ datasetId: 'ds-missing' });
      const error = assertErr(result);
      expect(error).toBe('dataset-not-found');
    });

    it('returns validation error when dataset has no items', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1', version: 1 } as never);
      vi.mocked(deps.datasetsStorage.listItems).mockResolvedValueOnce({ items: [], total: 0 } as never);

      const result = await service.create({ datasetId: 'ds-1' });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
      expect((result as { error: string; details?: unknown }).details).toBe('Dataset has no items');
    });
  });

  describe('delete', () => {
    it('cancels running experiment by setting status to failed', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce({
        id: 'exp-1',
        status: 'running',
      } as never);

      const result = await service.delete('exp-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true, cancelled: true });
      expect(deps.experimentsStorage.updateExperiment).toHaveBeenCalledWith({ id: 'exp-1', status: 'failed' });
    });

    it('fully deletes non-running experiment', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce({
        id: 'exp-1',
        status: 'completed',
      } as never);

      const result = await service.delete('exp-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.experimentsStorage.deleteExperiment).toHaveBeenCalledWith({ id: 'exp-1' });
    });

    it('returns not-found when experiment does not exist', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce(null as never);
      const result = await service.delete('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('getResults', () => {
    it('returns experiment results', async () => {
      const mockResults = { results: [{ id: 'r-1' }], total: 1 };
      vi.mocked(deps.experimentsStorage.listExperimentResults).mockResolvedValueOnce(mockResults as never);

      const result = await service.getResults('exp-1', { page: 0, perPage: 50 });
      const data = assertOk(result);
      expect(data).toEqual(mockResults);
    });

    it('caps perPage at 100', async () => {
      vi.mocked(deps.experimentsStorage.listExperimentResults).mockResolvedValueOnce({
        results: [],
        total: 0,
      } as never);
      await service.getResults('exp-1', { perPage: 200 });
      expect(deps.experimentsStorage.listExperimentResults).toHaveBeenCalledWith(
        expect.objectContaining({ perPage: 100 }),
      );
    });
  });

  describe('compare', () => {
    it('returns validation error when IDs are missing', async () => {
      const result = await service.compare('', 'exp-2');
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns not-found when experiment A does not exist', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce(null as never);
      vi.mocked(deps.experimentsStorage.getExperimentById).mockResolvedValueOnce({ id: 'exp-2' } as never);

      const result = await service.compare('exp-1', 'exp-2');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('returns validation error when experiments have different datasets', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById)
        .mockResolvedValueOnce({ id: 'exp-1', datasetId: 'ds-1' } as never)
        .mockResolvedValueOnce({ id: 'exp-2', datasetId: 'ds-2' } as never);

      const result = await service.compare('exp-1', 'exp-2');
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
      expect((result as { error: string; details?: unknown }).details).toContain('same dataset');
    });

    it('compares experiments on the same dataset', async () => {
      vi.mocked(deps.experimentsStorage.getExperimentById)
        .mockResolvedValueOnce({ id: 'exp-1', datasetId: 'ds-1' } as never)
        .mockResolvedValueOnce({ id: 'exp-2', datasetId: 'ds-1' } as never);

      vi.mocked(deps.experimentsStorage.listExperimentResults)
        .mockResolvedValueOnce({
          results: [{ itemId: 'item-1', input: 'q1', output: { scores: [{ scorerId: 's1', score: 0.8 }] } }],
          total: 1,
        } as never)
        .mockResolvedValueOnce({
          results: [{ itemId: 'item-1', input: 'q1', output: { scores: [{ scorerId: 's1', score: 0.9 }] } }],
          total: 1,
        } as never);

      const result = await service.compare('exp-1', 'exp-2');
      const data = assertOk(result) as Record<string, unknown>;
      expect(data).toHaveProperty('aggregate');
      expect(data).toHaveProperty('items');
    });
  });
});
