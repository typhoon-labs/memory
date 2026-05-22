# Sync Targets

Sync targets define where Typhoon pulls source documents from (e.g., an S3 bucket). Each sync target has a name, source type, configuration, and optional cron schedule for automatic syncing.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

---

## List Sources

```
GET /v1/sources
```

Returns the list of available source types (e.g., `s3`).

---

## List Sync Targets

```
GET /v1/sync-targets
```

Returns all configured sync targets.

### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/sync-targets
```

---

## Create Sync Target

```
POST /v1/sync-targets
```

Creates a new sync target.

### Request Body

```json
{
  "name": "Support Docs",
  "source": "default",
  "sourceType": "s3",
  "config": {
    "prefix": "support/"
  },
  "cronSchedule": "0 */6 * * *",
  "isActive": true,
  "metadataTemplateId": "template-uuid",
  "autoExtractMetadata": false
}
```

| Field                 | Type                  | Required | Description                                                                                  |
| --------------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `name`                | string                | Yes      | Display name (min 1 character)                                                               |
| `sourceType`          | string                | Yes      | Source type identifier (e.g., `s3`)                                                          |
| `source`              | string                | Yes      | Source name from the source registry (bucket and credentials come from the source definition) |
| `config`              | object                | Yes      | Source-specific configuration. For S3: `{ prefix: string }` (bucket is in the source, not here) |
| `cronSchedule`        | string                | No       | Cron expression for automatic sync scheduling                                                |
| `isActive`            | boolean               | No       | Whether the sync target is active                                                            |
| `metadataTemplateId`  | string (UUID) or null | No       | Metadata template to assign (see [Metadata](metadata.md))                                    |
| `autoExtractMetadata` | boolean               | No       | Enable LLM-based metadata extraction during ingestion                                        |

> **Note:** The S3 bucket is defined in the source registry (see `GET /v1/sources`), not in the sync target config. The sync target only specifies a `prefix` within the source's bucket.

### Response

```
HTTP 201
```

Returns the created sync target object.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Docs",
    "source": "default",
    "sourceType": "s3",
    "config": {"prefix": "support/"},
    "cronSchedule": "0 */6 * * *"
  }' \
  http://localhost:5172/v1/sync-targets
```

---

## Get Sync Target

```
GET /v1/sync-targets/:id
```

Returns sync target details by ID.

### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Sync target ID. |

---

## Update Sync Target

```
PATCH /v1/sync-targets/:id
```

Updates a sync target. All fields from the create schema are accepted but optional. Config-managed sync targets cannot be edited (returns 403).

### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Sync target ID. |

### Request Body

Same fields as create, all optional.

---

## Delete Sync Target

```
DELETE /v1/sync-targets/:id
```

Deletes a sync target and all its document vectors. Config-managed sync targets cannot be deleted (returns 403).

### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Sync target ID. |

---

## Trigger Sync

```
POST /v1/sync-targets/:id/sync
```

Triggers a manual sync for the sync target. Enqueues a job on the `sync` BullMQ queue.

### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Sync target ID. |

### Request Body

```json
{
  "force": false
}
```

| Field   | Type    | Default | Description                                                         |
| ------- | ------- | ------- | ------------------------------------------------------------------- |
| `force` | boolean | `false` | When `true`, re-syncs all documents regardless of change detection. |

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"force": true}' \
  http://localhost:5172/v1/sync-targets/abc-123/sync
```

---

## Refresh Search Index

```
POST /v1/sync-targets/:id/refresh-search-index
```

Refreshes the `_searchMeta_*` chunk metadata fields for all documents in a sync target that have `searchMetaDirty = true`. This is a lightweight operation that recomputes search metadata via SQL without re-downloading or re-embedding documents. Use this after changing `searchable` or `searchPriority` on metadata fields.

### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Sync target ID. |

---

## Purge Documents

```
POST /v1/sync-targets/:id/purge
```

Deletes all documents and their vector embeddings for a sync target. The sync target itself is preserved.

---

## List Sync Jobs

```
GET /v1/sync-targets/:id/jobs
```

Returns the sync job history for a sync target.

---

## Upload Files

```
POST /v1/sync-targets/:id/upload
```

Uploads files to the sync target's storage. **S3 source type only.**

### Request Body

Multipart form data:

| Field   | Type   | Description                                        |
| ------- | ------ | -------------------------------------------------- |
| `files` | File[] | **Required.** One or more files to upload.         |
| `path`  | string | Optional sub-path within the sync target's prefix. |

### Response

```
HTTP 201
```

Returns the created document records.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -F "files=@guide.pdf" \
  -F "path=guides/" \
  http://localhost:5172/v1/sync-targets/abc-123/upload
```

---

## Browse Files

```
GET /v1/sync-targets/:id/browse
```

Browses files at a prefix within the sync target's storage. **S3 source type only.**

### Query Parameters

| Parameter | Type   | Default | Description                                         |
| --------- | ------ | ------- | --------------------------------------------------- |
| `path`    | string | `""`    | Sub-path to browse within the sync target's prefix. |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/sync-targets/abc-123/browse?path=guides/"
```

---

## Create Folder

```
POST /v1/sync-targets/:id/folders
```

Creates a folder in the sync target's storage. **S3 source type only.**

### Request Body

```json
{
  "path": "new-folder/"
}
```

| Field  | Type   | Description                                            |
| ------ | ------ | ------------------------------------------------------ |
| `path` | string | **Required.** Folder path to create (min 1 character). |

---

## Delete Folder

```
POST /v1/sync-targets/:id/folders/delete
```

Deletes a folder and all its contents. **S3 source type only.**

### Request Body

```json
{
  "path": "old-folder/"
}
```

| Field  | Type   | Description                                            |
| ------ | ------ | ------------------------------------------------------ |
| `path` | string | **Required.** Folder path to delete (min 1 character). |

---

## Move/Rename Folder

```
POST /v1/sync-targets/:id/folders/move
```

Moves or renames a folder. **S3 source type only.**

### Request Body

```json
{
  "oldPath": "old-name/",
  "newPath": "new-name/"
}
```

| Field     | Type   | Description                        |
| --------- | ------ | ---------------------------------- |
| `oldPath` | string | **Required.** Current folder path. |
| `newPath` | string | **Required.** New folder path.     |
