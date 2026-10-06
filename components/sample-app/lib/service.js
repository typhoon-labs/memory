// What the three services share: an HTTP server with a route table,
// GET /healthz, GET /metrics, request metrics, a server span per request and
// one JSON log line per request.
//
// /healthz and /metrics are answered before any of that, so probes and
// scrapes do not appear in request metrics, traces or logs.
import http from 'node:http';
import os from 'node:os';
import { configureLog, errorFields, log } from './log.js';
import { Registry } from './metrics.js';
import { SpanKind, Tracer, parseTraceparent, runWithSpan } from './tracing.js';

export { errorFields, log };

// Thrown by a handler to answer with a client error instead of a 500.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function readBody(req, limit = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'payload_too_large', 'Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON');
  }
}

function send(res, { status = 200, json, body = '', type = 'text/plain; charset=utf-8', headers = {} }) {
  const payload = json === undefined ? body : JSON.stringify(json);
  res.writeHead(status, {
    'content-type': json === undefined ? type : 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

// routes: { 'GET /path': handler } or { 'GET /path': { handler, label } }.
// `label` is the route name used in metrics and spans when many paths share
// one handler. A handler gets { req, path, query, span } and returns
// { status, json } or { status, body, type, headers }.
export function createService({ name, routes }) {
  const version = process.env.APP_VERSION || '0.0.0-dev';
  const environment = process.env.DEPLOYMENT_ENVIRONMENT || 'dev';
  const port = Number(process.env.PORT || 8080);
  configureLog({ service: name, version });

  const metrics = new Registry({ service_name: name, version });
  metrics.gauge('app_info', 'Constant 1, labelled with the running version.', () => 1);
  metrics.gauge('process_start_time_seconds', 'Start time of the process, in seconds since the Unix epoch.', () =>
    Math.round(Date.now() / 1000 - process.uptime()),
  );
  metrics.gauge('process_resident_memory_bytes', 'Resident memory size in bytes.', () => process.memoryUsage.rss());
  metrics.gauge(
    'process_cpu_seconds_total',
    'User and system CPU time spent, in seconds.',
    () => (process.cpuUsage().user + process.cpuUsage().system) / 1e6,
    'counter',
  );
  const requests = metrics.counter('http_requests_total', 'HTTP requests handled, by method, route and status.');
  const duration = metrics.histogram('http_request_duration_seconds', 'HTTP request duration in seconds, by method, route and status.');

  let lastExportError = 0;
  const tracer = new Tracer({
    resource: {
      'service.name': name,
      'service.version': version,
      'service.instance.id': os.hostname(),
      'deployment.environment': environment,
    },
    onError(err, dropped) {
      if (Date.now() - lastExportError < 60_000) return;
      lastExportError = Date.now();
      log.warn('trace export failed', { endpoint: tracer.url, dropped_spans: dropped, ...errorFields(err) });
    },
  });

  const table = new Map();
  for (const [key, value] of Object.entries(routes)) {
    const [method, path] = key.split(' ');
    const entry = typeof value === 'function' ? { handler: value, label: path } : { label: path, ...value };
    table.set(key, entry);
    requests.inc({ method, route: entry.label, status: '500' }, 0);
  }

  async function handle(req, res, path, query) {
    // HEAD is answered by the GET route; Node leaves the body out.
    const entry = table.get(`${req.method === 'HEAD' ? 'GET' : req.method} ${path}`);
    const route = entry?.label ?? 'unmatched';
    const started = process.hrtime.bigint();
    const span = tracer.startSpan(`${req.method} ${route}`, {
      kind: SpanKind.SERVER,
      parent: parseTraceparent(req.headers.traceparent),
      attributes: {
        'http.request.method': req.method,
        'http.route': route,
        'url.path': path,
        'url.query': query.toString() || undefined,
      },
    });

    await runWithSpan(span, async () => {
      let response;
      try {
        response = entry
          ? await entry.handler({ req, path, query, span })
          : { status: 404, json: { error: 'not_found', message: `No route for ${req.method} ${path}` } };
      } catch (err) {
        if (err instanceof HttpError) {
          response = { status: err.status, json: { error: err.code, message: err.message } };
        } else {
          span.recordException(err);
          log.error('request failed', errorFields(err));
          response = { status: 500, json: { error: 'internal_error', message: 'Internal server error', trace_id: span.traceId } };
        }
      }

      const status = response.status ?? 200;
      send(res, { ...response, status, headers: { 'x-trace-id': span.traceId, ...response.headers } });

      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const labels = { method: req.method, route, status: String(status) };
      requests.inc(labels);
      duration.observe(labels, seconds);
      span.setAttribute('http.response.status_code', status);
      if (status >= 500) span.setError(`HTTP ${status}`);
      span.end();
      log.info('request', {
        method: req.method,
        route,
        path,
        ...(query.size ? { query: query.toString() } : {}),
        status,
        duration_ms: Math.round(seconds * 1e5) / 100,
      });
    });
  }

  const server = http.createServer((req, res) => {
    const mark = req.url.indexOf('?');
    // "/search/" is the same route as "/search".
    const path = (mark < 0 ? req.url : req.url.slice(0, mark)).replace(/(.)\/$/, '$1');
    const query = new URLSearchParams(mark < 0 ? '' : req.url.slice(mark + 1));

    if (req.method === 'GET' && path === '/healthz') {
      return send(res, { json: { status: 'ok', service: name, version } });
    }
    if (req.method === 'GET' && path === '/metrics') {
      return send(res, { body: metrics.render(), type: 'text/plain; version=0.0.4; charset=utf-8' });
    }
    handle(req, res, path, query).catch((err) => {
      log.error('response failed', errorFields(err));
      res.destroy();
    });
  });

  function shutdown(signal) {
    log.info('shutting down', { signal });
    // In-flight requests finish; idle keep-alive connections are closed.
    server.close(() => tracer.flush().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  }

  function listen() {
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    return new Promise((resolve) => {
      server.listen(port, () => {
        log.info('listening', { port: server.address().port, environment, trace_export: tracer.url ?? 'off' });
        resolve(server);
      });
    });
  }

  return { name, version, metrics, tracer, server, listen };
}
