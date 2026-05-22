import { trace } from '@opentelemetry/api';
import { createAppLogger } from '@typhoon/logger';
import { llmRequestDuration, llmRetryCount } from '@typhoon/telemetry';

const log = createAppLogger('llm-fetch');

/** Status codes that are retryable (transient). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface InstrumentedFetchOptions {
  /** Maximum number of retry attempts. Default: 3. */
  maxRetries: number;
  /** Initial retry delay in milliseconds. Default: 500. */
  retryDelayMs: number;
  /** Maximum retry delay in milliseconds. Default: 10_000. */
  retryMaxDelayMs: number;
}

/**
 * Creates a fetch wrapper that adds:
 * - Retry with exponential backoff + jitter on 429/5xx/network errors
 * - W3C traceparent header injection for distributed tracing
 * - Response request ID capture into active OTel span
 * - Request duration metrics
 *
 * Designed to be passed as the `fetch` option to `createOpenAICompatible`.
 */
export function createInstrumentedFetch(opts: InstrumentedFetchOptions): typeof globalThis.fetch {
  const { maxRetries, retryDelayMs, retryMaxDelayMs } = opts;

  const instrumentedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);

    // Inject W3C traceparent from active OTel context
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const ctx = activeSpan.spanContext();
      const traceFlags = ctx.traceFlags.toString(16).padStart(2, '0');
      headers.set('traceparent', `00-${ctx.traceId}-${ctx.spanId}-${traceFlags}`);
    }

    const patchedInit: RequestInit = { ...init, headers };
    const t0 = Date.now();
    let lastError: Error | null = null;
    let lastStatus = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Backoff on retry
      if (attempt > 0) {
        const baseDelay = Math.min(retryDelayMs * 2 ** (attempt - 1), retryMaxDelayMs);
        const jitter = baseDelay * (0.75 + Math.random() * 0.5);
        // oxlint-disable-next-line no-await-in-loop -- retry loop: backoff delay
        await sleep(jitter);
        llmRetryCount.add(1, { attempt: String(attempt), status: String(lastStatus) });
        log.warn('Retrying LLM request', { attempt, status: lastStatus, delayMs: Math.round(jitter) });
      }

      try {
        // oxlint-disable-next-line no-await-in-loop -- retry loop: actual request
        const response = await globalThis.fetch(input, patchedInit);
        lastStatus = response.status;

        if (response.ok) {
          // Record duration
          llmRequestDuration.record(Date.now() - t0, { status: String(response.status) });

          // Capture provider request ID into active span
          captureRequestId(response, activeSpan);

          return response;
        }

        // Retryable status
        if (RETRYABLE_STATUSES.has(response.status)) {
          // Check Retry-After header
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          if (retryAfter && attempt < maxRetries) {
            const waitMs = Math.min(retryAfter * 1000, retryMaxDelayMs);
            log.warn('Rate limited, using Retry-After', { status: response.status, waitMs });
            // oxlint-disable-next-line no-await-in-loop -- retry loop: rate-limit delay
            await sleep(waitMs);
            llmRetryCount.add(1, { attempt: String(attempt + 1), status: String(response.status) });
            // Skip the normal backoff on next iteration
            attempt++;
            if (attempt > maxRetries) {
              llmRequestDuration.record(Date.now() - t0, { status: String(response.status) });
              return response;
            }
            continue;
          }

          lastError = new Error(`LLM request failed: ${response.status} ${response.statusText}`);
          continue;
        }

        // Non-retryable error (4xx except 429) — return immediately
        llmRequestDuration.record(Date.now() - t0, { status: String(response.status) });
        return response;
      } catch (err) {
        // Network error (DNS, connection refused, etc.) — retryable
        lastStatus = 0;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) {
          llmRequestDuration.record(Date.now() - t0, { status: 'network_error' });
          throw lastError;
        }
      }
    }

    // All retries exhausted — throw last error
    llmRequestDuration.record(Date.now() - t0, { status: String(lastStatus) });
    throw lastError ?? new Error(`LLM request failed after ${maxRetries} retries`);
  };

  // Match the full `typeof fetch` signature which includes a `preconnect` method
  instrumentedFetch.preconnect = globalThis.fetch.preconnect?.bind(globalThis.fetch);

  return instrumentedFetch as typeof globalThis.fetch;
}

/** Capture provider request ID from response headers into the active OTel span. */
function captureRequestId(response: Response, activeSpan: ReturnType<typeof trace.getActiveSpan>): void {
  if (!activeSpan) return;
  const requestId =
    response.headers.get('x-amzn-requestid') ??
    response.headers.get('x-request-id') ??
    response.headers.get('x-amzn-trace-id');
  if (requestId) {
    activeSpan.setAttribute('llm.provider.request_id', requestId);
  }
}

/** Parse Retry-After header value (seconds or HTTP-date) into seconds. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  // Try HTTP-date format
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const delta = (date - Date.now()) / 1000;
    return delta > 0 ? delta : null;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
