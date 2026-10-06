// W3C trace context and span export over OTLP/HTTP with a JSON body.
//
// Spans are always created, so logs carry a trace id and outbound calls carry
// `traceparent` whether or not a collector exists. They are exported only when
// OTEL_EXPORTER_OTLP_ENDPOINT (or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) is set.
// The endpoint must be an OTLP HTTP receiver (usually port 4318), not gRPC.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export const SpanKind = { INTERNAL: 1, SERVER: 2, CLIENT: 3 };

const STATUS_ERROR = 2;
const MAX_QUEUE = 2048;
const MAX_BATCH = 256;
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

const storage = new AsyncLocalStorage();
const epochOffset = BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint();
const now = () => process.hrtime.bigint() + epochOffset;

export const currentSpan = () => storage.getStore();
export const runWithSpan = (span, fn) => storage.run(span, fn);

export function parseTraceparent(header) {
  const match = TRACEPARENT.exec(String(header ?? '').trim().toLowerCase());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1], spanId: match[2] };
}

// "a=b,c=d" as used by OTEL_RESOURCE_ATTRIBUTES and OTEL_EXPORTER_OTLP_HEADERS.
function parsePairs(text) {
  const pairs = {};
  for (const item of String(text ?? '').split(',')) {
    const i = item.indexOf('=');
    if (i > 0) pairs[item.slice(0, i).trim()] = decodeURIComponent(item.slice(i + 1).trim());
  }
  return pairs;
}

function toValue(value) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isInteger(value)) return { intValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

const toAttributes = (object) =>
  Object.entries(object)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: toValue(value) }));

class Span {
  constructor(tracer, name, { kind = SpanKind.INTERNAL, parent, attributes = {} } = {}) {
    this.tracer = tracer;
    this.name = name;
    this.kind = kind;
    this.traceId = parent?.traceId ?? randomBytes(16).toString('hex');
    this.parentSpanId = parent?.spanId;
    this.spanId = randomBytes(8).toString('hex');
    this.attributes = { ...attributes };
    this.events = [];
    this.startTime = now();
  }

  get traceparent() {
    return `00-${this.traceId}-${this.spanId}-01`;
  }

  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  setError(message) {
    this.errorMessage ??= String(message);
  }

  recordException(err) {
    this.events.push({
      time: now(),
      name: 'exception',
      attributes: {
        'exception.type': err?.name ?? 'Error',
        'exception.message': String(err?.message ?? err),
        'exception.stacktrace': err?.stack,
      },
    });
    this.setError(err?.message ?? err);
  }

  end() {
    if (this.endTime) return;
    this.endTime = now();
    this.tracer.enqueue(this);
  }

  toOtlp() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      ...(this.parentSpanId ? { parentSpanId: this.parentSpanId } : {}),
      name: this.name,
      kind: this.kind,
      startTimeUnixNano: String(this.startTime),
      endTimeUnixNano: String(this.endTime),
      attributes: toAttributes(this.attributes),
      events: this.events.map((event) => ({
        timeUnixNano: String(event.time),
        name: event.name,
        attributes: toAttributes(event.attributes),
      })),
      status: this.errorMessage ? { code: STATUS_ERROR, message: this.errorMessage } : {},
    };
  }
}

export class Tracer {
  constructor({ resource, onError = () => {} }) {
    const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    this.url = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || (base ? `${base.replace(/\/+$/, '')}/v1/traces` : null);
    this.headers = { 'content-type': 'application/json', ...parsePairs(process.env.OTEL_EXPORTER_OTLP_HEADERS) };
    this.resource = toAttributes({ ...parsePairs(process.env.OTEL_RESOURCE_ATTRIBUTES), ...resource });
    this.onError = onError;
    this.queue = [];
    if (this.url) setInterval(() => this.flush(), 2000).unref();
  }

  startSpan(name, options) {
    return new Span(this, name, options);
  }

  enqueue(span) {
    if (this.url && this.queue.length < MAX_QUEUE) this.queue.push(span);
  }

  // An outbound HTTP call as a client span, with `traceparent` injected so the
  // callee's spans join the caller's trace.
  async fetch(peer, url, { timeoutMs = 3000, ...init } = {}) {
    const target = new URL(url);
    const method = init.method ?? 'GET';
    const span = this.startSpan(`${method} ${target.pathname}`, {
      kind: SpanKind.CLIENT,
      parent: currentSpan(),
      attributes: {
        'http.request.method': method,
        'url.full': target.href,
        'server.address': target.hostname,
        'server.port': Number(target.port) || (target.protocol === 'https:' ? 443 : 80),
        'peer.service': peer,
      },
    });
    try {
      const response = await fetch(target, {
        ...init,
        headers: { ...init.headers, traceparent: span.traceparent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      span.setAttribute('http.response.status_code', response.status);
      if (response.status >= 400) span.setError(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  flush() {
    this.flushing ??= this.send().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async send() {
    while (this.url && this.queue.length) {
      const spans = this.queue.splice(0, MAX_BATCH);
      const body = JSON.stringify({
        resourceSpans: [
          {
            resource: { attributes: this.resource },
            scopeSpans: [{ scope: { name: 'sample-app' }, spans: spans.map((span) => span.toOtlp()) }],
          },
        ],
      });
      try {
        const response = await fetch(this.url, {
          method: 'POST',
          headers: this.headers,
          body,
          signal: AbortSignal.timeout(5000),
        });
        await response.arrayBuffer();
        if (!response.ok) throw new Error(`collector answered HTTP ${response.status}`);
      } catch (err) {
        // Telemetry must never take the service down: drop the batch, report, carry on.
        this.onError(err, spans.length);
        return;
      }
    }
  }
}
