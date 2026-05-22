/** A dataset returned by the API. */
export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Paginated list response for datasets. */
export interface DatasetListResponse {
  datasets: Dataset[];
  total: number;
}

/** Payload for POST /v1/admin/datasets. */
export interface CreateDatasetInput {
  name: string;
  description?: string;
  [key: string]: unknown;
}

/** Payload for PATCH /v1/admin/datasets/:id. */
export interface UpdateDatasetInput {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/** A single dataset item. */
export interface DatasetItem {
  id: string;
  datasetId: string;
  input: string;
  expectedOutput: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Paginated list response for dataset items. */
export interface DatasetItemListResponse {
  items: DatasetItem[];
  total: number;
}

/** Payload for POST /v1/admin/datasets/:id/items. */
export interface AddDatasetItemsInput {
  items: Array<{
    input: string;
    expectedOutput?: string;
    metadata?: Record<string, unknown>;
  }>;
}

/** Payload for PATCH /v1/admin/datasets/:id/items/:itemId. */
export interface UpdateDatasetItemInput {
  input?: string;
  expectedOutput?: string;
  metadata?: Record<string, unknown>;
}
