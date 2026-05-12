import type { RelevanceScoreProvider } from '@mastra/core/relevance';

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
    private timeoutMs: number = 15_000,
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
    return entries.length > 0 ? entries[entries.length - 1] : null;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: requests.map((r) => ({ text: r.text })),
          top_n: requests.length,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = new Error(`Rerank failed: ${res.status} ${res.statusText}`);
        for (const r of requests) r.reject(err);
        return;
      }
      const data = (await res.json()) as { results?: { index: number; relevance_score?: number }[] };
      const results = data.results ?? [];
      const scores = results.map((r) => r.relevance_score ?? 0);

      this.metricsMap.set(query, {
        model: this.model,
        documentCount: requests.length,
        resultCount: results.length,
        topScore: scores.length > 0 ? Math.max(...scores) : 0,
        durationMs: Date.now() - t0,
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const r of requests) r.reject(error);
    } finally {
      clearTimeout(timer);
    }
  }
}
