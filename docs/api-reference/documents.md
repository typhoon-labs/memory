# Documents

Document endpoints manage the source documents that have been synced into the knowledge base. Documents are associated with sync targets and contain parsed content, vector chunks, and optional custom metadata.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

---

## List Documents

```
GET /v1/documents
```

Returns all documents, optionally filtered by sync target.

### Query Parameters

| Parameter      | Type   | Description                         |
| -------------- | ------ | ----------------------------------- |
| `syncTargetId` | string | Filter documents by sync target ID. |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/documents?syncTargetId=abc-123"
```

---

## Get Document

```
GET /v1/documents/:id
```

Returns document details including status, metadata, source information, and sync target association.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

---

## Update Document

```
PATCH /v1/documents/:id
```

Updates a document's title, description, and/or custom metadata. Custom metadata is validated against the sync target's metadata template schema -- non-schema keys are silently stripped.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

### Request Body

```json
{
  "title": "Updated title",
  "description": "A guide about refund policies",
  "customMetadata": {
    "region": "US",
    "department": "support"
  }
}
```

| Field            | Type           | Description                                                               |
| ---------------- | -------------- | ------------------------------------------------------------------------- |
| `title`          | string or null | New title (optional).                                                     |
| `description`    | string or null | New description (optional).                                               |
| `customMetadata` | object         | Custom metadata fields (optional). Validated against the template schema. |

---

## Delete Document

```
DELETE /v1/documents/:id
```

Deletes a document, its vector embeddings, and the source object from storage.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

---

## Bulk Delete Documents

```
POST /v1/documents/bulk-delete
```

Deletes up to 100 documents in a single request.

### Request Body

```json
{
  "ids": ["doc-uuid-1", "doc-uuid-2"]
}
```

| Field | Type            | Description                                                 |
| ----- | --------------- | ----------------------------------------------------------- |
| `ids` | string[] (UUID) | **Required.** Array of document IDs to delete. Maximum 100. |

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"ids": ["doc-uuid-1", "doc-uuid-2"]}' \
  http://localhost:5172/v1/documents/bulk-delete
```

---

## Bulk Purge Documents

```
POST /v1/documents/bulk-purge
```

Removes vector embeddings and marks documents as deleted **without** removing the source files from S3. Unlike `bulk-delete`, the original files remain in storage and can be re-synced later.

### Request Body

```json
{
  "ids": ["doc-uuid-1", "doc-uuid-2"]
}
```

| Field | Type            | Description                                                |
| ----- | --------------- | ---------------------------------------------------------- |
| `ids` | string[] (UUID) | **Required.** Array of document IDs to purge. Maximum 100. |

---

## Bulk Update Metadata

```
POST /v1/documents/bulk-metadata
```

Updates custom metadata for multiple documents at once.

### Request Body

```json
{
  "ids": ["doc-uuid-1", "doc-uuid-2"],
  "customMetadata": {
    "region": "EU"
  },
  "merge": true
}
```

| Field            | Type            | Default      | Description                                                                  |
| ---------------- | --------------- | ------------ | ---------------------------------------------------------------------------- |
| `ids`            | string[] (UUID) | **Required** | Document IDs to update. Min 1, max 100.                                      |
| `customMetadata` | object          | **Required** | Metadata fields to set.                                                      |
| `merge`          | boolean         | `true`       | When `true`, merges with existing metadata. When `false`, replaces entirely. |

---

## Get Metadata Fields

```
GET /v1/documents/metadata-fields
```

Returns distinct custom metadata keys and their value distributions across documents. Useful for building filter UIs.

### Query Parameters

| Parameter      | Type   | Description               |
| -------------- | ------ | ------------------------- |
| `syncTargetId` | string | Filter by sync target ID. |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/documents/metadata-fields?syncTargetId=abc-123"
```

---

## Get Document Chunks

```
GET /v1/documents/:id/chunks
```

Returns the stored vector chunks for a document, ordered by `startIndex`. Each chunk contains the text content and its embedding metadata.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

---

## Get Parsed Content

```
GET /v1/documents/:id/parsed-content
```

Returns the full parsed text content of a document. Supports HTTP caching via `ETag`/`If-None-Match` headers.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

### Request Headers

| Header          | Description                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `If-None-Match` | ETag value from a previous response. If the content has not changed, the server returns `304 Not Modified`. |

### Response Headers

| Header          | Description                         |
| --------------- | ----------------------------------- |
| `ETag`          | Content hash for cache validation.  |
| `Cache-Control` | `private, max-age=300` (5 minutes). |

### Response

```json
{
  "text": "Full parsed text content of the document..."
}
```

Returns `304 Not Modified` (no body) if the `If-None-Match` header matches the current content hash.

---

## Download Document

```
GET /v1/documents/:id/download
```

Downloads the original source file as a binary attachment.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

### Response Headers

| Header                | Value                                              |
| --------------------- | -------------------------------------------------- |
| `Content-Type`        | Original MIME type (or `application/octet-stream`) |
| `Content-Disposition` | `attachment; filename="<original-filename>"`       |
| `Content-Length`      | File size in bytes                                 |

---

## Retry Failed Document

```
POST /v1/documents/:id/retry
```

Re-queues a failed document for processing. The document must be in `error` status.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

### Errors

| Status | Condition                           |
| ------ | ----------------------------------- |
| 400    | Document is not in an error state   |
| 409    | Document is already being processed |

---

## Resync Document

```
POST /v1/documents/:id/resync
```

Fully re-processes a document: re-fetches from source, re-parses, re-chunks, and re-embeds. Accepts documents in any status including `deleted`, enabling re-processing of purged files whose S3 source still exists.

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

---

## Move Document

```
POST /v1/documents/:id/move
```

Moves or renames a document's source key in storage. Only supported for source types that allow object manipulation (e.g., S3).

### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Document ID. |

### Request Body

```json
{
  "newSourceKey": "new/path/to/document.pdf"
}
```

| Field          | Type   | Description                                          |
| -------------- | ------ | ---------------------------------------------------- |
| `newSourceKey` | string | **Required.** New source key/path (min 1 character). |
