import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { entry, freePort, metric, start, startCollector, until } from './helpers.js';

describe('web', () => {
  let collector;
  let searchPort;
  let search;
  let registration;
  let web;

  const startSearch = async (version) => {
    search = await start(entry.search(version), {
      PORT: searchPort,
      APP_VERSION: version,
      OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    });
  };
  const api = async (pathAndQuery, init) => {
    const response = await fetch(`${web.url}${pathAndQuery}`, init);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };

  before(async () => {
    collector = await startCollector();
    searchPort = await freePort();
    await startSearch('2.0.0');
    registration = await start(entry.registration, { APP_VERSION: '1.0.0' });
    web = await start(entry.web, {
      APP_VERSION: '1.0.0',
      SEARCH_SERVICE_URL: `http://127.0.0.1:${searchPort}`,
      REGISTRATION_SERVICE_URL: registration.url,
      OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    });
  });
  after(async () => {
    await Promise.all([web.stop(), search?.stop(), registration.stop()]);
    await collector.stop();
  });

  test('serves the app on the three pages, with its files and what it shows from the seed', async () => {
    let html;
    for (const path of ['/', '/search', '/register']) {
      const response = await fetch(`${web.url}${path}`);
      html = await response.text();
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      assert.ok(html.includes('<title>Sample App</title>'), path);
      assert.ok(html.includes('<div id="root">'), path);
      assert.ok(!html.includes('{{'), `${path} has an unfilled placeholder`);
    }

    // The page names its script and its stylesheet; both must be served, and cached for good.
    const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    assert.ok(files.some((file) => file.endsWith('.js')) && files.some((file) => file.endsWith('.css')), 'a script and a stylesheet');
    for (const file of files) {
      const response = await fetch(`${web.url}${file}`);
      assert.equal(response.status, 200, file);
      assert.match(response.headers.get('cache-control'), /immutable/, file);
    }
    assert.equal((await fetch(`${web.url}/favicon.svg`)).headers.get('content-type'), 'image/svg+xml');
    assert.equal((await fetch(`${web.url}/assets/../src/server.js`)).status, 404);

    const site = await api('/api/site');
    assert.equal(site.body.title, 'Sample App');
    assert.ok(site.body.suggestions.includes('tiny pink hexagon'), 'suggested searches come from the seed');

    const head = await fetch(`${web.url}/search/`, { method: 'HEAD' });
    assert.equal(head.status, 200, 'HEAD and a trailing slash reach the same page');
    assert.equal(await head.text(), '');
  });

  test('proxies search and registration', async () => {
    const found = await api('/api/search?q=red');
    assert.equal(found.status, 200);
    assert.equal(found.body.count, 50);

    const registered = await api('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Example', email: 'ada@example.test' }),
    });
    assert.equal(registered.status, 201);
    assert.match(registered.body.confirmation, /^REG-/);

    const invalid = await api('/api/register', { method: 'POST', body: '{"name":""}' });
    assert.equal(invalid.status, 400);
  });

  test('reports versions and the registration count', async () => {
    const { body } = await api('/api/status');
    assert.deepEqual(body.services, [
      { name: 'web', version: '1.0.0', up: true },
      { name: 'search-service', version: '2.0.0', up: true },
      { name: 'registration-service', version: '1.0.0', up: true },
    ]);
    assert.ok(body.registrations_today >= 1);
  });

  test('carries one trace from web to the backend, into logs and exported spans', async () => {
    const traceId = 'ab'.repeat(16);
    const { headers } = await api('/api/search?q=green', { headers: { traceparent: `00-${traceId}-${'cd'.repeat(8)}-01` } });
    assert.equal(headers.get('x-trace-id'), traceId);
    // Log lines reach this process a moment after the response does.
    await until(() => web.logs.some((line) => line.msg === 'request' && line.trace_id === traceId));
    await until(() => search.logs.some((line) => line.msg === 'request' && line.trace_id === traceId));

    const spans = await until(() => {
      const mine = collector.spans.filter((span) => span.traceId === traceId);
      return mine.length === 3 && mine;
    });
    const server = spans.find((span) => span.resource['service.name'] === 'web' && span.kind === 2);
    const client = spans.find((span) => span.resource['service.name'] === 'web' && span.kind === 3);
    const backend = spans.find((span) => span.resource['service.name'] === 'search-service');
    assert.equal(server.name, 'GET /api/search');
    assert.equal(server.parentSpanId, 'cd'.repeat(8));
    assert.equal(client.parentSpanId, server.spanId);
    assert.equal(backend.parentSpanId, client.spanId);
    assert.equal(backend.name, 'GET /search');
    assert.equal(backend.resource['service.version'], '2.0.0');
    assert.equal(backend.resource['deployment.environment'], 'dev');
    assert.ok(BigInt(backend.endTimeUnixNano) >= BigInt(backend.startTimeUnixNano));
  });

  test('shows the failure when search is 2.1.0, stays up, and recovers on 2.0.0', async () => {
    await search.stop();
    await startSearch('2.1.0');

    const failed = await api('/api/search?q=red');
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, 'search_failed');
    assert.equal((await api('/api/status')).body.services[1].version, '2.1.0');
    assert.equal((await fetch(`${web.url}/search`)).status, 200, 'the page itself still loads');
    assert.equal((await fetch(`${web.url}/healthz`)).status, 200);
    assert.ok((await metric(web, 'http_requests_total', { route: '/api/search', status: '500' })) >= 1);
    await until(() => web.logs.some((line) => line.level === 'error' && line.backend === 'search-service' && line.status === 500));

    const errorSpan = await until(() => collector.spans.find((span) => span.resource['service.version'] === '2.1.0' && span.status.code === 2));
    assert.equal(errorSpan.events[0].name, 'exception');

    await search.stop();
    await startSearch('2.0.0');
    const recovered = await api('/api/search?q=red');
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.count, 50);
  });

  test('answers 502 and stays up when a backend is gone', async () => {
    await search.stop();
    search = null;

    const failed = await api('/api/search?q=red');
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error, 'backend_unreachable');
    const { body } = await api('/api/status');
    assert.deepEqual(body.services[1], { name: 'search-service', version: null, up: false });
    assert.equal(body.services[2].up, true);
    assert.equal((await fetch(`${web.url}/`)).status, 200);

    await startSearch('2.0.0');
    assert.equal((await api('/api/search?q=red')).status, 200);
  });
});
