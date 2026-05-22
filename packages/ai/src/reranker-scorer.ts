import type { RelevanceScoreProvider } from '@mastra/core/relevance';
import { trace } from '@opentelemetry/api';
import { createAppLogger } from '@typhoon/logger';
import { rerankRetryCount, rerankSearchUnits } from '@typhoon/telemetry';

const log = createAppLogger('reranker');

/** Status codes that are retryable (transient). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

interface PendingRequest {
  text: string;
  resolve: (score: number) => void;
  reject: (err: Error) => void;
}

/** Metrics from the most recent rerank batch. */
export interface RerankMetrics {
  model: string;
  documentCount: number;
  resultCount: number;
  topScore: number;
  durationMs: number;
  searchUnits?: number;
}

/**
 * Calls a Cohere-compatible `/rerank` endpoint (e.g. Bifrost gateway)
 * and returns a relevance score for a query–document pair.
 *
 * Concurrent calls with the same query (e.g. from `Promise.all` in
 * `rerankWithScorer`) are automatically batched into a single API
 * request to avoid rate limiting.
 */
export class RerankerScorer implements RelevanceScoreProvider {
  private pending: Map<string, PendingRequest[]> = new Map();
  private flushScheduled = false;
  private metricsMap: Map<string, RerankMetrics> = new Map();

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private timeoutMs: number = Number(process.env.RERANKER_TIMEOUT_MS ?? 15_000),
    private maxRetries: number = Number(process.env.RERANKER_MAX_RETRIES ?? process.env.LLM_MAX_RETRIES ?? 3),
    private retryDelayMs: number = Number(process.env.RERANKER_RETRY_DELAY_MS ?? process.env.LLM_RETRY_DELAY_MS ?? 500),
    private retryMaxDelayMs: number = Number(
      process.env.RERANKER_RETRY_MAX_DELAY_MS ?? process.env.LLM_RETRY_MAX_DELAY_MS ?? 10_000,
    ),
  ) {}

  /** Retrieve and consume metrics for a specific query. Returns null if not found. */
  getMetrics(query: string): RerankMetrics | null {
    const m = this.metricsMap.get(query) ?? null;
    if (m) this.metricsMap.delete(query);
    return m;
  }

  /** @deprecated Use getMetrics(query) for concurrency-safe access. */
  get lastMetrics(): RerankMetrics | null {
    const entries = [...this.metricsMap.values()];
    return entries.at(-1) ?? null;
  }

  async getRelevanceScore(query: string, text: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let batch = this.pending.get(query);
      if (!batch) {
        batch = [];
        this.pending.set(query, batch);
      }
      batch.push({ text, resolve, reject });

      if (!this.flushScheduled) {
        this.flushScheduled = true;
        queueMicrotask(() => {
          this.flush().catch(() => {});
        });
      }
    });
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    const batches = new Map(this.pending);
    this.pending.clear();

    const promises: Promise<void>[] = [];
    for (const [query, requests] of batches) {
      promises.push(this.executeBatch(query, requests));
    }
    await Promise.all(promises);
  }

  private async executeBatch(query: string, requests: PendingRequest[]): Promise<void> {
    const t0 = Date.now();
    let lastError: Error | null = null;
    let lastStatus = 0;

    // Build headers with trace propagation
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const ctx = activeSpan.spanContext();
      const traceFlags = ctx.traceFlags.toString(16).padStart(2, '0');
      headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-${traceFlags}`;
    }

    const body = JSON.stringify({
      model: this.model,
      query,
      documents: requests.map((r) => ({ text: r.text })),
      top_n: requests.length,
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Backoff on retry
      if (attempt > 0) {
        const baseDelay = Math.min(this.retryDelayMs * 2 ** (attempt - 1), this.retryMaxDelayMs);
        const jitter = baseDelay * (0.75 + Math.random() * 0.5);
        // oxlint-disable-next-line no-await-in-loop -- retry loop: backoff delay
        await new Promise((r) => setTimeout(r, jitter));
        rerankRetryCount.add(1, { model: this.model, attempt: String(attempt) });
        log.warn('Retrying rerank request', { attempt, status: lastStatus });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        // oxlint-disable-next-line no-await-in-loop -- retry loop: actual request
        const res = await fetch(`${this.baseUrl}/rerank`, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        lastStatus = res.status;

        if (res.ok) {
          // oxlint-disable-next-line no-await-in-loop -- retry loop: parse response body
          const data = (await res.json()) as {
            results?: { index: number; relevance_score?: number }[];
            meta?: { billed_units?: { search_units?: number } };
          };
          const results = data.results ?? [];
          const scores = results.map((r) => r.relevance_score ?? 0);

          // Record billed units metric
          const searchUnits = data.meta?.billed_units?.search_units;
          if (searchUnits) {
            rerankSearchUnits.add(searchUnits, { model: this.model });
          }

          // Capture provider request ID
          const requestId = res.headers.get('x-amzn-requestid') ?? res.headers.get('x-request-id');
          if (requestId && activeSpan) {
            activeSpan.setAttribute('rerank.provider.request_id', requestId);
          }

          this.metricsMap.set(query, {
            model: this.model,
            documentCount: requests.length,
            resultCount: results.length,
            topScore: scores.length > 0 ? Math.max(...scores) : 0,
            durationMs: Date.now() - t0,
            searchUnits: searchUnits ?? undefined,
          });

          for (const r of results) {
            const req = requests[r.index];
            if (req) req.resolve(r.relevance_score ?? 0);
          }
          // Resolve any requests not covered by results (shouldn't happen, but be safe)
          for (let i = 0; i < requests.length; i++) {
            if (!results.some((r) => r.index === i)) {
              requests[i].resolve(0);
            }
          }
          return;
        }

        // Retryable status
        if (RETRYABLE_STATUSES.has(res.status)) {
          lastError = new Error(`Rerank failed: ${res.status} ${res.statusText}`);
          continue;
        }

        // Non-retryable error — fail immediately
        const err = new Error(`Rerank failed: ${res.status} ${res.statusText}`);
        for (const r of requests) r.reject(err);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === this.maxRetries) break;
      } finally {
        clearTimeout(timer);
      }
    }

    // All retries exhausted
    const error = lastError ?? new Error(`Rerank failed after ${this.maxRetries} retries`);
    for (const r of requests) r.reject(error);
  }
}
