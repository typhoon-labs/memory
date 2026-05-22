/**
 * Custom application metrics that cannot be derived from spans.
 *
 * LLM token usage, request duration, and queue job metrics are NOT defined
 * here — they are derived automatically from span attributes by the OTel
 * Collector's `spanmetrics` connector. Only business metrics that don't
 * correspond to any span go here.
 *
 * @module
 */

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('typhoon');

/** Total number of conversations started. */
export const conversationStarted = meter.createCounter('conversation.started', {
  description: 'Total number of conversations started',
});

// ── Queue / Sync Metrics ──────────────────────────────────────────────

/** Observable gauge: current jobs waiting in the sync queue. */
export const syncQueueDepth = meter.createObservableGauge('sync.queue.depth', {
  description: 'Number of jobs waiting in the sync queue',
});

/** Histogram: total processing duration per job, by job type. */
export const syncJobDuration = meter.createHistogram('sync.job.duration', {
  description: 'Job processing duration in milliseconds',
  unit: 'ms',
});

/** Counter: completed sync jobs by type. */
export const syncJobCompleted = meter.createCounter('sync.job.completed', {
  description: 'Total completed sync jobs',
});

/** Counter: failed sync jobs by type. */
export const syncJobFailed = meter.createCounter('sync.job.failed', {
  description: 'Total failed sync jobs',
});

/** Counter: stalled sync jobs. */
export const syncJobStalled = meter.createCounter('sync.job.stalled', {
  description: 'Total stalled sync jobs',
});

/** Histogram: per-stage processing duration in the pipeline. */
export const syncStageDuration = meter.createHistogram('sync.stage.duration', {
  description: 'Per-stage processing duration in milliseconds',
  unit: 'ms',
});

// ── Scoring Metrics ─────────────────────────────────────────────────

/** Histogram: individual scorer execution duration, keyed by scorer type. */
export const scorerDuration = meter.createHistogram('scoring.scorer.duration', {
  description: 'Individual scorer execution duration in milliseconds',
  unit: 'ms',
});

/** Counter: scoring flows that completed with at least one permanently failed scorer. */
export const scoringPartialFailure = meter.createCounter('scoring.flow.partial_failure', {
  description: 'Scoring flows with partial scorer failures',
});

// ── Embedding Metrics ────────────────────────────────────────────────

/** Histogram: chunk character count distribution before embedding. */
export const chunkSizeChars = meter.createHistogram('embed.chunk.size_chars', {
  description: 'Character count per chunk sent for embedding',
  unit: 'chars',
});

/** Counter: embedding retries triggered by token/size limit errors. */
export const embedRetryCount = meter.createCounter('embed.retry', {
  description: 'Embedding retries triggered by token/size limit errors',
});

/** Histogram: tokens consumed per embedding call (when provider returns usage). */
export const embedTokenUsage = meter.createHistogram('embed.token_usage', {
  description: 'Tokens consumed per embedding call',
  unit: 'tokens',
});

// ── LLM Provider Metrics ────────────────────────────────────────────

/** Histogram: LLM/embedding provider HTTP request duration. */
export const llmRequestDuration = meter.createHistogram('llm.request.duration', {
  description: 'LLM provider request duration',
  unit: 'ms',
});

/** Counter: LLM/embedding provider request retries (429, 5xx, network errors). */
export const llmRetryCount = meter.createCounter('llm.request.retries', {
  description: 'LLM provider request retries',
});

// ── Reranker Metrics ────────────────────────────────────────────────

/** Counter: reranker billed search units (from Cohere meta.billed_units). */
export const rerankSearchUnits = meter.createCounter('rerank.search_units', {
  description: 'Reranker billed search units',
});

/** Counter: reranker request retries. */
export const rerankRetryCount = meter.createCounter('rerank.request.retries', {
  description: 'Reranker request retries',
});
