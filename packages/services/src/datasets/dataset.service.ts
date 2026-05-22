import type { DrizzleDatasetsStorage } from '@typhoon/db/drivers/pg';

import type { Result } from '../types';

export interface DatasetServiceDeps {
  datasetsStorage: DrizzleDatasetsStorage;
}

export class DatasetService {
  constructor(private deps: DatasetServiceDeps) {}

  /** List datasets with pagination. */
  async list(opts: { page?: number; perPage?: number }): Promise<Result<unknown>> {
    const page = opts.page ?? 0;
    const perPage = Math.min(opts.perPage ?? 100, 100);
    const result = await this.deps.datasetsStorage.listDatasets({ page, perPage });
    return { data: result };
  }

  /** Get a dataset by ID. */
  async getById(id: string): Promise<Result<unknown>> {
    const dataset = await this.deps.datasetsStorage.getDatasetById({ id });
    if (!dataset) return { error: 'not-found' };
    return { data: dataset };
  }

  /** Create a new dataset. */
  async create(input: { name: string; description?: string | null; metadata?: unknown }): Promise<Result<unknown>> {
    if (!input.name || typeof input.name !== 'string') {
      return { error: 'validation-failed', details: 'name is required' };
    }
    const dataset = await this.deps.datasetsStorage.createDataset({
      name: input.name,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
    });
    return { data: { ...(dataset as object), _status: 201 as const } };
  }

  /** Update a dataset. */
  async update(id: string, body: Record<string, unknown>): Promise<Result<unknown>> {
    const existing = await this.deps.datasetsStorage.getDatasetById({ id });
    if (!existing) return { error: 'not-found' };
    const updated = await this.deps.datasetsStorage._doUpdateDataset({ id, ...body });
    return { data: updated };
  }

  /** Delete a dataset. */
  async delete(id: string): Promise<Result<{ ok: true }>> {
    const existing = await this.deps.datasetsStorage.getDatasetById({ id });
    if (!existing) return { error: 'not-found' };
    await this.deps.datasetsStorage.deleteDataset({ id });
    return { data: { ok: true } };
  }

  /** List items for a dataset. */
  async listItems(datasetId: string, opts: { page?: number; perPage?: number }): Promise<Result<unknown>> {
    const page = opts.page ?? 0;
    const perPage = Math.min(opts.perPage ?? 100, 100);
    const result = await this.deps.datasetsStorage.listItems({ datasetId, page, perPage });
    return { data: result };
  }

  /** Add items to a dataset (single or batch). */
  async addItems(
    datasetId: string,
    body: {
      items?: Array<Record<string, unknown>>;
      input?: unknown;
      groundTruth?: unknown;
      requestContext?: unknown;
      metadata?: unknown;
    },
  ): Promise<Result<unknown>> {
    // Validate dataset exists
    const dataset = await this.deps.datasetsStorage.getDatasetById({ id: datasetId });
    if (!dataset) return { error: 'not-found' };

    const version = (dataset as unknown as { version: number }).version ?? 0;

    // Batch mode: body.items is an array
    if (Array.isArray(body.items)) {
      const result = await this.deps.datasetsStorage._doBatchInsertItems({
        datasetId,
        datasetVersion: version,
        items: body.items,
      });
      return { data: { items: result, _status: 201 as const } };
    }

    // Single item mode
    if (!body.input) {
      return { error: 'validation-failed', details: 'input is required' };
    }
    const item = await this.deps.datasetsStorage._doAddItem({
      datasetId,
      datasetVersion: version,
      input: body.input,
      groundTruth: body.groundTruth ?? null,
      requestContext: body.requestContext ?? null,
      metadata: body.metadata ?? null,
    });
    return { data: { ...(item as object), _status: 201 as const } };
  }

  /** Update a dataset item. */
  async updateItem(
    datasetId: string,
    itemId: string,
    body: { input?: unknown; groundTruth?: unknown },
  ): Promise<Result<unknown>> {
    const dataset = await this.deps.datasetsStorage.getDatasetById({ id: datasetId });
    if (!dataset) return { error: 'not-found' };

    const version = (dataset as unknown as { version: number }).version ?? 0;

    const updated = await this.deps.datasetsStorage._doUpdateItem({
      id: itemId,
      datasetVersion: version,
      ...(body.input !== undefined ? { input: body.input } : {}),
      ...(body.groundTruth !== undefined ? { groundTruth: body.groundTruth } : {}),
    });
    return { data: updated };
  }

  /** Delete a dataset item. */
  async deleteItem(datasetId: string, itemId: string): Promise<Result<{ ok: true }>> {
    await this.deps.datasetsStorage._doDeleteItem({ id: itemId, datasetId });
    return { data: { ok: true } };
  }
}
