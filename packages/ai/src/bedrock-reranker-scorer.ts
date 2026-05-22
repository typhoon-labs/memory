import { BedrockAgentRuntimeClient, RerankCommand, type RerankSource } from '@aws-sdk/client-bedrock-agent-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { RelevanceScoreProvider } from '@mastra/core/relevance';
import { trace } from '@opentelemetry/api';
import { createAppLogger } from '@typhoon/logger';
import { rerankRetryCount } from '@typhoon/telemetry';

import type { RerankMetrics } from './reranker-scorer';

const log = createAppLogger('bedrock-reranker');

/** Status codes that are retryable (transient). */
const RETRYABLE_ERROR_NAMES = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'InternalServerException',
  'ModelTimeoutException',
]);

interface PendingRequest {
  text: string;
  resolve: (score: number) => void;
  reject: (err: Error) => void;
}

/**
 * Calls the AWS Bedrock Rerank API directly using the AWS SDK.
 * Uses the default credential provider chain (IRSA, instance profiles, env vars).
 *
 * Concurrent calls with the same query are automatically batched into a single
 * API request, matching the behavior of the gateway-based RerankerScorer.
 */
export class BedrockRerankerScorer implements RelevanceScoreProvider {
  private pending: Map<string, PendingRequest[]> = new Map();
  private flushScheduled = false;
  private metricsMap: Map<string, RerankMetrics> = new Map();
  private client: BedrockAgentRuntimeClient;

  /**
   * @param modelArn Full ARN of the Bedrock reranker model (e.g. `arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0`).
   * @param region AWS region. Defaults to `AWS_REGION` env var or `us-east-1`.
   * @param maxRetries Maximum retry attempts on transient errors. Defaults to `RERANKER_MAX_RETRIES` or `LLM_MAX_RETRIES`.
   * @param retryDelayMs Initial retry delay in milliseconds. Defaults to `RERANKER_RETRY_DELAY_MS` or `LLM_RETRY_DELAY_MS`.
   * @param retryMaxDelayMs Maximum retry delay (backoff cap). Defaults to `RERANKER_RETRY_MAX_DELAY_MS` or `LLM_RETRY_MAX_DELAY_MS`.
   */
  constructor(
    private modelArn: string,
    private region: string = process.env.AWS_REGION ?? 'us-east-1',
    private maxRetries: number = Number(process.env.RERANKER_MAX_RETRIES ?? process.env.LLM_MAX_RETRIES ?? 3),
    private retryDelayMs: number = Number(process.env.RERANKER_RETRY_DELAY_MS ?? process.env.LLM_RETRY_DELAY_MS ?? 500),
    private retryMaxDelayMs: number = Number(
      process.env.RERANKER_RETRY_MAX_DELAY_MS ?? process.env.LLM_RETRY_MAX_DELAY_MS ?? 10_000,
    ),
  ) {
    this.client = new BedrockAgentRuntimeClient({
      region: this.region,
      credentials: fromNodeProviderChain(),
    });
  }

  /** Retrieve and consume metrics for a specific query. Returns null if not found. */
  getMetrics(query: string): RerankMetrics | null {
    const m = this.metricsMap.get(query) ?? null;
    if (m) this.metricsMap.delete(query);
    return m;
  }

  /**
   * Returns a relevance score for a query--document pair.
   * Concurrent calls with the same query are batched into a single Bedrock Rerank API request.
   */
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

    const sources: RerankSource[] = requests.map((r) => ({
      type: 'INLINE',
      inlineDocumentSource: {
        type: 'TEXT',
        textDocument: { text: r.text },
      },
    }));

    const command = new RerankCommand({
      queries: [{ type: 'TEXT', textQuery: { text: query } }],
      sources,
      rerankingConfiguration: {
        type: 'BEDROCK_RERANKING_MODEL',
        bedrockRerankingConfiguration: {
          modelConfiguration: { modelArn: this.modelArn },
          numberOfResults: requests.length,
        },
      },
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Backoff on retry
      if (attempt > 0) {
        const baseDelay = Math.min(this.retryDelayMs * 2 ** (attempt - 1), this.retryMaxDelayMs);
        const jitter = baseDelay * (0.75 + Math.random() * 0.5);
        // oxlint-disable-next-line no-await-in-loop -- retry loop: backoff delay
        await new Promise((r) => setTimeout(r, jitter));
        rerankRetryCount.add(1, { model: this.modelArn, attempt: String(attempt) });
        log.warn('Retrying Bedrock rerank request', { attempt });
      }

      try {
        // oxlint-disable-next-line no-await-in-loop -- retry loop: actual request
        const response = await this.client.send(command);
        const results = response.results ?? [];

        // Capture request ID into active OTel span
        const requestId = response.$metadata?.requestId;
        const activeSpan = trace.getActiveSpan();
        if (requestId && activeSpan) {
          activeSpan.setAttribute('rerank.provider.request_id', requestId);
        }

        this.metricsMap.set(query, {
          model: this.modelArn,
          documentCount: requests.length,
          resultCount: results.length,
          topScore: results.length > 0 ? Math.max(...results.map((r) => r.relevanceScore ?? 0)) : 0,
          durationMs: Date.now() - t0,
          searchUnits: undefined,
        });

        for (const r of results) {
          const idx = r.index;
          if (idx !== undefined && requests[idx]) {
            requests[idx].resolve(r.relevanceScore ?? 0);
          }
        }
        // Resolve any requests not covered by results
        for (let i = 0; i < requests.length; i++) {
          if (!results.some((r) => r.index === i)) {
            requests[i].resolve(0);
          }
        }
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        // Check if retryable
        const errorName = (err as { name?: string }).name ?? '';
        if (!RETRYABLE_ERROR_NAMES.has(errorName) || attempt === this.maxRetries) {
          break;
        }
      }
    }

    // All retries exhausted
    const error = lastError ?? new Error(`Bedrock rerank failed after ${this.maxRetries} retries`);
    for (const r of requests) r.reject(error);
  }
}
