/**
 * OpenTelemetry SDK initialization module.
 *
 * **Must be imported before any other application code** so that context
 * propagation and auto-instrumentations are active when `pg` / `ioredis` /
 * `bullmq` modules are first loaded.
 *
 * @example
 * ```ts
 * // First line of your app entrypoint:
 * import '@typhoon/telemetry/instrumentation';
 * ```
 *
 * @module
 */

import { BullMQInstrumentation } from '@appsignal/opentelemetry-instrumentation-bullmq';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME || 'typhoon';
const serviceVersion = process.env.OTEL_SERVICE_VERSION || '0.0.0';
const environment = process.env.NODE_ENV || 'development';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  'deployment.environment.name': environment,
});

const traceExporter = new OTLPTraceExporter({
  url: `${endpoint}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${endpoint}/v1/metrics`,
});

/**
 * The initialized OpenTelemetry Node SDK instance.
 * Exported for graceful shutdown in tests or custom lifecycle management.
 */
export const sdk = new NodeSDK({
  resource,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30_000,
  }),
  textMapPropagator: new W3CTraceContextPropagator(),
  instrumentations: [
    new PgInstrumentation({
      enhancedDatabaseReporting: false,
    }),
    new IORedisInstrumentation({
      requireParentSpan: true,
    }),
    new BullMQInstrumentation(),
  ],
});

sdk.start();

process.on('SIGTERM', async () => {
  await sdk.shutdown();
});
