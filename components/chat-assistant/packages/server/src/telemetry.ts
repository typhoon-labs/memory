/**
 * OpenTelemetry, loaded before the application (`node --import ./telemetry.js`).
 *
 * Export is on only when OTEL_EXPORTER_OTLP_ENDPOINT is set; the exporter,
 * protocol and headers come from the standard OTEL_* variables. Inbound HTTP
 * and outbound fetch are instrumented, so W3C trace context is read from
 * callers and propagated to the gateway, delivery-mcp, the other agents and
 * the model route.
 */
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': process.env.OTEL_SERVICE_NAME ?? 'chat-assistant',
      'service.version': process.env.APP_VERSION ?? '0.0.0-dev',
      'deployment.environment': process.env.DEPLOYMENT_ENVIRONMENT ?? 'dev',
    }),
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === '/healthz' }),
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  const stop = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
