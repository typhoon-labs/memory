# Datasets

## Overview

Datasets are named collections of test items used by [experiments](./experiments.md) to evaluate agent performance. Each item represents a single evaluation scenario with an input question and optional ground truth answer.

## Data Model

### Datasets

The `datasets` table stores dataset-level metadata:

| Column                 | Type      | Description                                          |
| ---------------------- | --------- | ---------------------------------------------------- |
| `id`                   | UUID      | Primary key                                          |
| `name`                 | text      | Human-readable dataset name                          |
| `description`          | text      | Optional description of the dataset's purpose        |
| `metadata`             | JSONB     | Arbitrary metadata                                   |
| `inputSchema`          | JSONB     | Optional JSON Schema for item inputs                 |
| `groundTruthSchema`    | JSONB     | Optional JSON Schema for ground truth answers        |
| `requestContextSchema` | JSONB     | Optional JSON Schema for request context             |
| `version`              | integer   | Current version number (incremented on item changes) |
| `createdAt`            | timestamp | Creation time                                        |
| `updatedAt`            | timestamp | Last modification time                               |

### Dataset Items

The `dataset_items` table stores individual test cases. Items are versioned using a composite primary key of `(id, datasetVersion)`:

| Column           | Type    | Description                                                |
| ---------------- | ------- | ---------------------------------------------------------- |
| `id`             | UUID    | Item identifier (not unique alone -- versioned)            |
| `datasetId`      | UUID    | Foreign key to the parent dataset                          |
| `datasetVersion` | integer | Version this item belongs to                               |
| `validTo`        | integer | Version at which this item was superseded (null = current) |
| `isDeleted`      | boolean | Soft delete flag                                           |
| `input`          | JSONB   | The test input (typically `{ question: "..." }`)           |
| `groundTruth`    | JSONB   | The expected output / ideal answer                         |
| `requestContext` | JSONB   | Optional additional context for the evaluation             |
| `metadata`       | JSONB   | Arbitrary item-level metadata                              |

### Dataset Versions

The `dataset_versions` table tracks version history:

| Column      | Type      | Description                       |
| ----------- | --------- | --------------------------------- |
| `id`        | UUID      | Primary key                       |
| `datasetId` | UUID      | Foreign key to the parent dataset |
| `version`   | integer   | Version number                    |
| `createdAt` | timestamp | When this version was created     |

## Versioning

Datasets use a point-in-time versioning scheme:

1. Each item modification (add, update, delete) increments the dataset's `version` counter.
2. Modified items get a new row with the new `datasetVersion`. The previous row's `validTo` is set to the new version.
3. Deleted items are marked with `isDeleted: true` in the new version.
4. Querying items for a specific version returns all items where `datasetVersion <= version` and (`validTo` is null or `validTo > version`) and `isDeleted = false`.

This allows experiments to reference a specific dataset version, ensuring reproducibility even after the dataset is modified.

## Item Structure

A typical dataset item for RAG evaluation:

```json
{
  "input": {
    "question": "What is the company's PTO policy?"
  },
  "groundTruth": {
    "answer": "Employees receive 15 days of PTO per year, accrued monthly."
  },
  "requestContext": null
}
```

The `input.question` field is extracted by the experiment runner and passed to the agent. The `groundTruth` is stored alongside the experiment result for manual comparison (it is not currently used by automated scorers).

## CRUD Operations

Datasets are managed via the admin API:

| Endpoint                               | Method | Description                  |
| -------------------------------------- | ------ | ---------------------------- |
| `/v1/admin/datasets`                   | GET    | List all datasets            |
| `/v1/admin/datasets`                   | POST   | Create a new dataset         |
| `/v1/admin/datasets/:id`               | GET    | Get dataset with items       |
| `/v1/admin/datasets/:id`               | PATCH  | Update dataset metadata      |
| `/v1/admin/datasets/:id`               | DELETE | Delete dataset and all items |
| `/v1/admin/datasets/:id/items`         | POST   | Add items (bulk)             |
| `/v1/admin/datasets/:id/items/:itemId` | PATCH  | Update an item               |
| `/v1/admin/datasets/:id/items/:itemId` | DELETE | Delete an item               |

All dataset endpoints require admin authentication.

## Key Files

- `packages/db/src/schema/datasets.ts` -- Drizzle schema definitions
- `apps/api/src/routes/datasets.ts` -- CRUD route handlers
