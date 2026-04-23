/**
 * Re-exports the official `@hono/otel` middleware for Hono HTTP request tracing.
 *
 * Creates OpenTelemetry spans and metrics for every HTTP request, with proper
 * context propagation so downstream spans (Mastra agent, DB, Redis) nest correctly.
 *
 * @example
 * ```ts
 * import { otelMiddleware } from '@typhoon/telemetry';
 * app.use('*', otelMiddleware());
 * ```
 *
 * @module
 */

import { httpInstrumentationMiddleware } from '@hono/otel';

/**
 * Creates a Hono middleware that instruments HTTP requests with OpenTelemetry.
 *
 * Delegates to `@hono/otel` which creates server spans, records request
 * duration metrics, and propagates W3C trace context.
 */
export const otelMiddleware = httpInstrumentationMiddleware;
