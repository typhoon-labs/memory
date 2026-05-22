# Search

Search endpoints provide semantic and hybrid search against the knowledge base. Both endpoints require authentication.

**Auth:** Session cookie or `X-API-Key` header.

---

## Vector Search

```
POST /v1/search
```

Performs a semantic (vector) search against the embedded document chunks using cosine similarity.

### Request Body

```json
{
  "query": "How do I process a refund?",
  "topK": 10,
  "minScore": 0.6,
  "rerank": false
}
```

| Field      | Type          | Default                      | Description                                                                                                                                                                                               |
| ---------- | ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`    | string        | **Required**                 | Search query text. Max length limited by `EMBEDDING_MAX_CHARS`.                                                                                                                                           |
| `topK`     | number (1-50) | `10`                         | Number of results to return.                                                                                                                                                                              |
| `minScore` | number (0-1)  | `RAG_VECTOR_MIN_SCORE` (0.6) | Discard results below this cosine similarity threshold. When reranking is enabled, this threshold is skipped during initial retrieval and applied after reranking.                                        |
| `rerank`   | boolean       | `false`                      | Enable cross-encoder reranking via Cohere Rerank for improved relevance. When enabled, retrieval is inflated to `RAG_RERANK_CANDIDATES` (default 100) candidates and the reranker selects the top `topK`. |

### Response

Returns an array of matching document chunks with scores, content, and source metadata.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I process a refund?", "topK": 5}' \
  http://localhost:5172/v1/search
```

---

## Hybrid Search

```
POST /v1/search/hybrid
```

Performs a hybrid search combining vector similarity and keyword matching. Reranking is enabled by default for hybrid search.

### Request Body

```json
{
  "query": "How do I process a refund?",
  "topK": 100,
  "minScore": 0.5,
  "dedup": true,
  "rerank": true,
  "expanded": false
}
```

| Field      | Type           | Default      | Description                                                                                                                                                     |
| ---------- | -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`    | string         | **Required** | Search query text. Max length limited by `EMBEDDING_MAX_CHARS`.                                                                                                 |
| `topK`     | number (1-500) | --           | Number of results to return. Defaults to `RAG_RERANK_CANDIDATES` (100) or `RAG_RERANK_CANDIDATES_EXPANDED` (200) when expanded.                                 |
| `minScore` | number (0-1)   | --           | Discard results below this threshold (applied after reranking). Defaults to `RAG_RERANK_MIN_SCORE` when reranking.                                              |
| `dedup`    | boolean        | `true`       | Deduplicate results. Default mode deduplicates by `documentId` (1 result per document); expanded mode deduplicates by `chunkId` (multiple chunks per document). |
| `rerank`   | boolean        | `true`       | Cross-encoder reranking via Cohere Rerank for relevance ordering.                                                                                               |
| `expanded` | boolean        | `false`      | Expanded deep search mode. Retrieves `RAG_RERANK_CANDIDATES_EXPANDED` candidates and deduplicates by `chunkId`, showing multiple passages per document.         |

### Response

Returns an array of matching document chunks with scores, content, and source metadata.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I process a refund?", "expanded": true}' \
  http://localhost:5172/v1/search/hybrid
```

### Validation Errors

If the request body fails Zod validation, the endpoint returns:

```json
HTTP 400
{
  "error": "Invalid request",
  "details": [...]
}
```

The `details` array contains Zod issue objects describing each validation failure.
