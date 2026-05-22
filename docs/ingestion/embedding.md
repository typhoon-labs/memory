# Embedding Pipeline

## Overview

Chunks are embedded via a configurable OpenAI-compatible endpoint. The embedding stage includes adaptive chunk sizing, rate limiting, retry with recursive splitting, and batching support.

## Adaptive Token Ratio Tracker

A per-document `TokenRatioTracker` learns the chars-per-token ratio from successful embeds:

1. On the first chunk, the ratio is unknown and the ceiling is `EMBEDDING_MAX_CHARS`.
2. As chunks embed successfully and the provider returns token usage, the tracker computes:
   ```
   safeMaxChars = EMBEDDING_MAX_TOKENS * measured_ratio * 0.9
   ```
3. Subsequent chunks that exceed this adaptive limit are **proactively split before calling the API** -- avoiding wasted API calls on oversized inputs.
4. Splitting and embedding are interleaved, so each chunk's split decision uses the latest ratio from all previous successful embeds in the same document.

## Retry on Failure

If any embed call fails (regardless of error type), the chunk is split in half and retried recursively up to 3 levels deep. This handles:

- **Cold-start failures** -- before the ratio calibrates on the first document
- **Transient errors** -- network timeouts, rate limit responses
- **Unknown error formats** -- different embedding providers return errors in different shapes

Each retry is logged and tracked via the `embed.retry` OTel counter.

## Batching

When `EMBEDDING_BATCH_SIZE` is set to a value greater than 1, chunks are sent in batches via `embedMany`. If a batch fails or returns the wrong number of embeddings, the pipeline falls back to per-chunk embedding with retry.

The default batch size is 1 (per-chunk embedding only), which provides the most reliable behavior across providers.

## Rate Limiting

A module-scope rate limiter shared across all concurrent workers in the process controls embedding API access:

| Variable                           | Default | Description                            |
| ---------------------------------- | ------- | -------------------------------------- |
| `EMBEDDING_RATE_LIMIT_CONCURRENT`  | `3`     | Maximum concurrent embedding API calls |
| `EMBEDDING_RATE_LIMIT_INTERVAL_MS` | `200`   | Minimum interval between requests (ms) |

The rate limiter uses an acquire/release pattern -- each embed call acquires a slot before the API call and releases it when done.

## Observability

The embedding stage records comprehensive telemetry:

### OpenTelemetry Spans

The `processFile` root span includes attributes:

- `embed.count` -- total embedded chunks (may exceed input chunk count due to splits)
- `embed.retries` -- total retry count
- `embed.proactive_splits` -- chunks proactively split before API call
- `embed.total_tokens` -- sum of tokens across all embed calls
- `embed.chars_per_token` -- final measured ratio

### Metrics

| Metric                   | Type      | Description                                 |
| ------------------------ | --------- | ------------------------------------------- |
| `embed.chunk.size_chars` | Histogram | Character count per chunk sent to embedding |
| `embed.retry`            | Counter   | Number of retry-with-split operations       |
| `embed.token_usage`      | Histogram | Tokens consumed per embed call              |

### Logs

- **Summary log** at pipeline end with all stats including per-stage timing
- **Debug logs** per chunk (index, chars, preview) and per embed (success/retry)

## Environment Variables

| Variable                           | Default | Description                                      |
| ---------------------------------- | ------- | ------------------------------------------------ |
| `EMBEDDING_BASE_URL`               | --      | OpenAI-compatible embedding endpoint             |
| `EMBEDDING_MODEL`                  | --      | Embedding model identifier                       |
| `EMBEDDING_DIMENSION`              | --      | Embedding vector dimension                       |
| `EMBEDDING_MAX_CHARS`              | `2000`  | Hard ceiling on characters per chunk (~500 tokens for focused retrieval) |
| `EMBEDDING_MAX_TOKENS`             | `8192`  | Token limit for adaptive ratio calculation       |
| `EMBEDDING_BATCH_SIZE`             | `1`     | Chunks per `embedMany` call (1 = per-chunk only) |
| `EMBEDDING_RATE_LIMIT_CONCURRENT`  | `3`     | Max concurrent embed API calls                   |
| `EMBEDDING_RATE_LIMIT_INTERVAL_MS` | `200`   | Min interval between embed calls                 |

## Key Files

- `packages/ingestion/src/pipeline.ts` -- `TokenRatioTracker`, `embedChunkWithRetry()`, embed loop
- `packages/ingestion/src/util/rate-limiter.ts` -- rate limiter implementation
