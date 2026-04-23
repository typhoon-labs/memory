# @typhoon/worker

Headless BullMQ job consumer for document ingestion. Processes scan, file processing, and deletion jobs enqueued by the API and scheduler.

## Running

```bash
bun run dev   # Development with --watch
```

Health endpoint: `http://localhost:5170/healthz`

## Responsibilities

- Consumes BullMQ `sync` queue jobs (scan, process-file, delete-file)
- Downloads files from S3/MinIO via source providers
- Parses, chunks, embeds, and upserts document vectors
- Scales horizontally (multiple replicas via K8s HPA/KEDA)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | BullMQ connection |
| `DATABASE_URL` | PostgreSQL connection |
| `S3_*` | MinIO/S3 credentials |
| `EMBEDDING_*` | Embedding model config |
| `LLM_EXTRACTION_MODEL` | Model for metadata extraction |
| `SYNC_WORKER_CONCURRENCY` | Concurrent jobs per replica (default: 5) |
| `HEALTH_PORT` | Health server port (default: 5170) |

## Dependencies

`@typhoon/ai`, `@typhoon/db`, `@typhoon/ingestion`, `@typhoon/storage`, BullMQ
