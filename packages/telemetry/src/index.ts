/**
 * @typhoon/telemetry — Shared observability package for the Typhoon platform.
 *
 * Provides OpenTelemetry instrumentation, custom metrics, Hono middleware,
 * and Mastra observability bridge configuration.
 *
 * @example
 * ```ts
 * // In your app entrypoint (FIRST import):
 * import '@typhoon/telemetry/instrumentation';
 *
 * // Then use helpers:
 * import { getTracer, getMeter, createMastraObservability, otelMiddleware } from '@typhoon/telemetry';
 * ```
 *
 * @module
 */

import { DefaultExporter, Observability } from '@mastra/observability';
import { OtelBridge } from '@mastra/otel-bridge';
import { metrics, trace } from '@opentelemetry/api';

/** Re-export of `@hono/otel` middleware for HTTP request tracing and metrics. */
export { otelMiddleware } from './hono-middleware';
/** Custom application metrics. */
export {
  conversationStarted,
  syncJobCompleted,
  syncJobDuration,
  syncJobFailed,
  syncJobStalled,
  syncQueueDepth,
  syncStageDuration,
} from './metrics';

/**
 * Returns a named tracer instance for creating manual spans.
 *
 * @param name - Logical name for the tracer (e.g., 'chat', 'worker')
 */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

/**
 * Returns a named meter instance for creating custom metrics.
 *
 * @param name - Logical name for the meter (e.g., 'llm', 'queue')
 */
export function getMeter(name: string) {
  return metrics.getMeter(name);
}

/**
 * Returns the traceId of the currently active OTel span, or `null` if none.
 * Use this to capture trace context before an async boundary where the span
 * may no longer be active (e.g., in an `onFinish` streaming callback).
 */
export function getActiveTraceId(): string | null {
  return trace.getActiveSpan()?.spanContext().traceId ?? null;
}

/**
 * Creates a Mastra Observability instance configured with the OTel bridge.
 *
 * The bridge reads from OTel's ambient `AsyncLocalStorage` context so that
 * Mastra agent/model/tool spans become children of the active OTel span.
 *
 * @param serviceName - The service name to associate with Mastra spans
 */
export function createMastraObservability(serviceName: string) {
  return new Observability({
    configs: {
      default: {
        serviceName,
        exporters: [new DefaultExporter()],
        bridge: new OtelBridge(),
      },
    },
  });
}
