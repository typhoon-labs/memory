import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { entry, metric, start, until } from './helpers.js';

const get = async (service, pathAndQuery) => {
  const response = await fetch(`${service.url}${pathAndQuery}`);
  return { status: response.status, body: await response.json() };
};

describe('search-service 2.0.0', () => {
  let service;
  before(async () => {
    service = await start(entry.search('2.0.0'), { APP_VERSION: '2.0.0' });
  });
  after(() => service.stop());

  test('returns results for "red"', async () => {
    const { status, body } = await get(service, '/search?q=red');
    assert.equal(status, 200);
    assert.equal(body.count, 50);
    assert.equal(body.results.length, 50);
    assert.equal(body.indexed, 500);
    assert.ok(body.results.every((record) => record.color === 'red'));
    assert.deepEqual(Object.keys(body.results[0]), ['id', 'name', 'color', 'hex', 'shape', 'size']);
  });

  test('every word of the query must match', async () => {
    const { body } = await get(service, '/search?q=large+red+circle');
    assert.equal(body.count, 1);
    assert.equal(body.results[0].name, 'Large red circle');
  });

  test('an empty query lists the catalog, and limit is honored', async () => {
    const { body } = await get(service, '/search?q=&limit=0');
    assert.equal(body.count, 500);
    assert.equal(body.results.length, 0);
  });

  test('counts searches that match nothing', async () => {
    const before = await metric(service, 'search_zero_results_total');
    const { status, body } = await get(service, '/search?q=zzz');
    assert.equal(status, 200);
    assert.equal(body.count, 0);
    assert.equal(await metric(service, 'search_zero_results_total'), before + 1);
  });

  test('reports its version, and keeps probes out of request metrics', async () => {
    const health = await get(service, '/healthz');
    assert.deepEqual(health.body, { status: 'ok', service: 'search-service', version: '2.0.0' });
    assert.equal(await metric(service, 'app_info', { service_name: 'search-service', version: '2.0.0' }), 1);
    assert.equal(await metric(service, 'http_requests_total', { route: '/search', status: '500' }), 0);
    assert.ok((await metric(service, 'http_requests_total', { route: '/search', status: '200' })) >= 1);
    assert.ok((await metric(service, 'http_request_duration_seconds_count', { route: '/search', status: '200' })) >= 1);
    assert.equal(await metric(service, 'http_requests_total', { route: '/healthz' }), undefined);
  });

  test('logs each request as JSON with a trace id', async () => {
    const response = await fetch(`${service.url}/search?q=blue`);
    // Log lines reach this process a moment after the response does.
    const line = await until(() => service.logs.find((entry) => entry.msg === 'request' && entry.query === 'q=blue'));
    assert.equal(line.route, '/search');
    assert.equal(line.status, 200);
    assert.match(line.trace_id, /^[0-9a-f]{32}$/);
    assert.equal(line.trace_id, response.headers.get('x-trace-id'));
  });
});

describe('search-service 2.1.0', () => {
  let service;
  before(async () => {
    service = await start(entry.search('2.1.0'), { APP_VERSION: '2.1.0' });
  });
  after(() => service.stop());

  test('fails every search with HTTP 500', async () => {
    for (const query of ['red', 'zzz', '']) {
      const { status, body } = await get(service, `/search?q=${query}`);
      assert.equal(status, 500, `q=${query}`);
      assert.equal(body.error, 'search_failed');
    }
    assert.equal(await metric(service, 'http_requests_total', { route: '/search', status: '500', version: '2.1.0' }), 3);
  });

  test('logs the failure with a stack trace and the trace id', async () => {
    const { body } = await get(service, '/search?q=red');
    const line = await until(() => service.logs.find((entry) => entry.msg === 'search failed' && entry.trace_id === body.trace_id));
    assert.equal(line.level, 'error');
    assert.equal(line.version, '2.1.0');
    assert.equal(line.error_type, 'TypeError');
    assert.match(line.stack, /at rank \(.*ranking\.js:\d+/);
    assert.equal(line.query, 'red');
  });

  test('still passes its health check', async () => {
    const { status, body } = await get(service, '/healthz');
    assert.equal(status, 200);
    assert.equal(body.version, '2.1.0');
  });
});

test('title and records come from the seed file', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  const seed = path.join(dir, 'catalog.json');
  writeFileSync(seed, JSON.stringify({ title: 'Other', records: [{ id: 'X-1', name: 'Only one', hex: '#000000' }] }));
  const service = await start(entry.search('2.0.0'), { SEED_FILE: seed });
  try {
    const { body } = await get(service, '/search?q=only');
    assert.equal(body.title, 'Other');
    assert.equal(body.indexed, 1);
    assert.equal(body.results[0].id, 'X-1');
  } finally {
    await service.stop();
    rmSync(dir, { recursive: true });
  }
});
