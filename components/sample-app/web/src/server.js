// web: the pages, and a proxy from /api/* to the two backends.
//
// A failing backend never takes this service down. The API answers with the
// backend's status (or 502/504 when it cannot be reached) and the pages draw
// the error state.
import { readFileSync, readdirSync } from 'node:fs';
import { createService, errorFields, log, readBody } from '../../lib/service.js';

const backend = (value, fallback) => (value || fallback).replace(/\/+$/, '');
const SEARCH_URL = backend(process.env.SEARCH_SERVICE_URL, 'http://localhost:18183');
const REGISTRATION_URL = backend(process.env.REGISTRATION_SERVICE_URL, 'http://localhost:18184');

const here = (path) => new URL(path, import.meta.url);
const seedFile = process.env.SEED_FILE || here('../../seed/catalog.json');
const { title, description, suggestions = [] } = JSON.parse(readFileSync(seedFile, 'utf8'));

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');

// Pages are put together once, at start: layout + page body + seed values.
const layout = readFileSync(here('../pages/layout.html'), 'utf8');
const chips = suggestions.map((text) => `<button type="button" class="chip" data-q="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('');

function page(file, name) {
  const values = { title: escapeHtml(title), description: escapeHtml(description ?? ''), chips, page: name, script: `${file}.js` };
  const body = fill(layout, { ...values, content: fill(readFileSync(here(`../pages/${file}.html`), 'utf8'), values) });
  return () => ({ body, type: 'text/html; charset=utf-8', headers: NO_STORE });
}

const NO_STORE = { 'cache-control': 'no-store' };
const TYPES = { css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };
const assets = Object.fromEntries(
  readdirSync(here('../public/')).map((file) => {
    const body = readFileSync(here(`../public/${file}`));
    const type = TYPES[file.split('.').pop()] ?? 'application/octet-stream';
    return [`GET /static/${file}`, { label: '/static/*', handler: () => ({ body, type, headers: { 'cache-control': 'no-cache' } }) }];
  }),
);

// Passes the backend's answer through unchanged, so a backend 500 is a 500 here.
async function proxy(peer, url, init) {
  try {
    const upstream = await service.tracer.fetch(peer, url, init);
    const body = await upstream.text();
    if (upstream.status >= 500) log.error('backend answered with an error', { backend: peer, status: upstream.status });
    return { status: upstream.status, body, type: upstream.headers.get('content-type') ?? 'application/json', headers: NO_STORE };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError';
    log.error('backend unreachable', { backend: peer, ...errorFields(err) });
    return {
      status: timedOut ? 504 : 502,
      json: { error: timedOut ? 'backend_timeout' : 'backend_unreachable', message: `${peer} is not answering` },
      headers: NO_STORE,
    };
  }
}

// One backend's GET as JSON, or null if it fails for any reason.
async function ask(peer, url) {
  try {
    const response = await service.tracer.fetch(peer, url, { timeoutMs: 2000 });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// The same for /healthz, without a span: the backends do not trace their
// health endpoint, so a client span here would have no other half and would
// count as a successful call to a backend whose real requests are failing.
async function health(base) {
  try {
    const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const service = createService({
  name: 'web',
  routes: {
    'GET /': page('home', 'Home'),
    'GET /search': page('search', 'Search'),
    'GET /register': page('register', 'Register'),
    ...assets,

    'GET /api/search': ({ query }) => {
      const forwarded = new URLSearchParams({ q: query.get('q') ?? '' });
      if (query.has('limit')) forwarded.set('limit', query.get('limit'));
      return proxy('search-service', `${SEARCH_URL}/search?${forwarded}`);
    },

    'POST /api/register': async ({ req }) =>
      proxy('registration-service', `${REGISTRATION_URL}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: await readBody(req),
      }),

    // Versions come from each backend's /healthz, which answers as long as the
    // process runs: it says the service is up, not that its requests succeed.
    'GET /api/status': async () => {
      const [search, registration, stats] = await Promise.all([
        health(SEARCH_URL),
        health(REGISTRATION_URL),
        ask('registration-service', `${REGISTRATION_URL}/stats`),
      ]);
      return {
        json: {
          services: [
            { name: 'web', version: service.version, up: true },
            { name: 'search-service', version: search?.version ?? null, up: Boolean(search) },
            { name: 'registration-service', version: registration?.version ?? null, up: Boolean(registration) },
          ],
          registrations_today: stats?.registrations_today ?? null,
        },
        headers: NO_STORE,
      };
    },
  },
});

log.info('backends', { search_service: SEARCH_URL, registration_service: REGISTRATION_URL });
await service.listen();
