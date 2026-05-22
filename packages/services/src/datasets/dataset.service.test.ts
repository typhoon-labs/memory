import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import type { DatasetServiceDeps } from './dataset.service';
import { DatasetService } from './dataset.service';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<DatasetServiceDeps> = {}): DatasetServiceDeps {
  return {
    datasetsStorage: {
      listDatasets: vi.fn().mockResolvedValue({ datasets: [], total: 0 }),
      getDatasetById: vi.fn().mockResolvedValue(null),
      createDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'Test' }),
      deleteDataset: vi.fn().mockResolvedValue(undefined),
      listItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      _doUpdateDataset: vi.fn().mockResolvedValue({ id: 'ds-1' }),
      _doBatchInsertItems: vi.fn().mockResolvedValue([]),
      _doAddItem: vi.fn().mockResolvedValue({ id: 'item-1' }),
      _doUpdateItem: vi.fn().mockResolvedValue({ id: 'item-1' }),
      _doDeleteItem: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatasetServiceDeps['datasetsStorage'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DatasetService', () => {
  let deps: DatasetServiceDeps;
  let service: DatasetService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new DatasetService(deps);
  });

  describe('list', () => {
    it('returns paginated datasets', async () => {
      const mockResult = { datasets: [{ id: 'ds-1' }], total: 1 };
      vi.mocked(deps.datasetsStorage.listDatasets).mockResolvedValueOnce(mockResult as never);

      const result = await service.list({ page: 0, perPage: 20 });
      const data = assertOk(result);
      expect(data).toEqual(mockResult);
    });

    it('caps perPage at 100', async () => {
      vi.mocked(deps.datasetsStorage.listDatasets).mockResolvedValueOnce({ datasets: [], total: 0 } as never);
      await service.list({ perPage: 500 });
      expect(deps.datasetsStorage.listDatasets).toHaveBeenCalledWith(expect.objectContaining({ perPage: 100 }));
    });

    it('defaults to page 0 and perPage 100', async () => {
      vi.mocked(deps.datasetsStorage.listDatasets).mockResolvedValueOnce({ datasets: [], total: 0 } as never);
      await service.list({});
      expect(deps.datasetsStorage.listDatasets).toHaveBeenCalledWith({ page: 0, perPage: 100 });
    });
  });

  describe('getById', () => {
    it('returns dataset when found', async () => {
      const dataset = { id: 'ds-1', name: 'Test Dataset' };
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(dataset as never);

      const result = await service.getById('ds-1');
      const data = assertOk(result);
      expect(data).toEqual(dataset);
    });

    it('returns not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.getById('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('create', () => {
    it('creates a dataset and returns it with 201 status', async () => {
      const created = { id: 'ds-new', name: 'New Dataset' };
      vi.mocked(deps.datasetsStorage.createDataset).mockResolvedValueOnce(created as never);

      const result = await service.create({ name: 'New Dataset', description: 'desc' });
      const data = assertOk(result);
      expect(data).toMatchObject({ id: 'ds-new', name: 'New Dataset', _status: 201 });
      expect(deps.datasetsStorage.createDataset).toHaveBeenCalledWith({
        name: 'New Dataset',
        description: 'desc',
        metadata: null,
      });
    });

    it('returns validation error when name is empty', async () => {
      const result = await service.create({ name: '' });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns validation error when name is not a string', async () => {
      const result = await service.create({ name: 123 as unknown as string });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });
  });

  describe('update', () => {
    it('updates dataset when it exists', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1' } as never);
      vi.mocked(deps.datasetsStorage._doUpdateDataset).mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Updated',
      } as never);

      const result = await service.update('ds-1', { name: 'Updated' });
      const data = assertOk(result);
      expect(data).toMatchObject({ name: 'Updated' });
    });

    it('returns not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.update('nonexistent', { name: 'X' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('delete', () => {
    it('deletes dataset and returns ok', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1' } as never);
      const result = await service.delete('ds-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.datasetsStorage.deleteDataset).toHaveBeenCalledWith({ id: 'ds-1' });
    });

    it('returns not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.delete('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('listItems', () => {
    it('returns paginated items', async () => {
      const mockResult = { items: [{ id: 'item-1' }], total: 1 };
      vi.mocked(deps.datasetsStorage.listItems).mockResolvedValueOnce(mockResult as never);

      const result = await service.listItems('ds-1', { page: 0, perPage: 10 });
      const data = assertOk(result);
      expect(data).toEqual(mockResult);
      expect(deps.datasetsStorage.listItems).toHaveBeenCalledWith({ datasetId: 'ds-1', page: 0, perPage: 10 });
    });
  });

  describe('addItems', () => {
    it('adds a single item', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1', version: 2 } as never);
      vi.mocked(deps.datasetsStorage._doAddItem).mockResolvedValueOnce({ id: 'item-new' } as never);

      const result = await service.addItems('ds-1', { input: { question: 'What?' } });
      const data = assertOk(result);
      expect(data).toMatchObject({ id: 'item-new', _status: 201 });
      expect(deps.datasetsStorage._doAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'ds-1',
          datasetVersion: 2,
          input: { question: 'What?' },
        }),
      );
    });

    it('adds batch items', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1', version: 1 } as never);
      vi.mocked(deps.datasetsStorage._doBatchInsertItems).mockResolvedValueOnce([{ id: 'i1' }, { id: 'i2' }] as never);

      const result = await service.addItems('ds-1', {
        items: [{ input: 'q1' }, { input: 'q2' }],
      });
      const data = assertOk(result);
      expect(data).toMatchObject({ items: [{ id: 'i1' }, { id: 'i2' }], _status: 201 });
    });

    it('returns not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.addItems('nonexistent', { input: {} });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('returns validation error when input is missing for single item', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1', version: 1 } as never);
      const result = await service.addItems('ds-1', {});
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });
  });

  describe('updateItem', () => {
    it('updates an item', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce({ id: 'ds-1', version: 3 } as never);
      vi.mocked(deps.datasetsStorage._doUpdateItem).mockResolvedValueOnce({ id: 'item-1', input: 'updated' } as never);

      const result = await service.updateItem('ds-1', 'item-1', { input: 'updated' });
      assertOk(result);
      expect(deps.datasetsStorage._doUpdateItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1', datasetVersion: 3, input: 'updated' }),
      );
    });

    it('returns not-found when dataset does not exist', async () => {
      vi.mocked(deps.datasetsStorage.getDatasetById).mockResolvedValueOnce(null as never);
      const result = await service.updateItem('nonexistent', 'item-1', { input: 'x' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('deleteItem', () => {
    it('deletes an item and returns ok', async () => {
      const result = await service.deleteItem('ds-1', 'item-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.datasetsStorage._doDeleteItem).toHaveBeenCalledWith({ id: 'item-1', datasetId: 'ds-1' });
    });
  });
});
