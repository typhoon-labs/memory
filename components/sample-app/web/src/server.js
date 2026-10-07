// web: the pages, and a proxy from /api/* to the two backends.
//
// The pages are one React app, built by Vite into ../ui/dist (see ../ui). Home,
// Search and Register get the same HTML, and the app draws the page for the
// address.
//
// A failing backend never takes this service down. The API answers with the
// backend's status (or 502/504 when it cannot be reached) and the pages draw
// the error state.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createService, errorFields, log, readBody } from '../../lib/service.js';

const backend = (value, fallback) => (value || fallback).replace(/\/+$/, '');
const SEARCH_URL = backend(process.env.SEARCH_SERVICE_URL, 'http://localhost:18183');
const REGISTRATION_URL = backend(process.env.REGISTRATION_SERVICE_URL, 'http://localhost:18184');

const here = (path) => new URL(path, import.meta.url);
const seedFile = process.env.SEED_FILE || here('../../seed/catalog.json');
const { title, description = '', suggestions = [] } = JSON.parse(readFileSync(seedFile, 'utf8'));

const dist = here('../ui/dist/');
if (!existsSync(dist)) {
  throw new Error('web/ui/dist is missing. Build the pages first: `npm ci && npm run build` in web/ui (`task test` and the image do this).');
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const NO_STORE = { 'cache-control': 'no-store' };
const NO_CACHE = { 'cache-control': 'no-cache' };
// Vite puts a hash of the content in the name of every file under assets/.
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' };
const TYPES = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
};

// Read once, at start. The title comes from the seed; the app sets the rest.
const shell = readFileSync(new URL('index.html', dist), 'utf8').replace('{{title}}', escapeHtml(title));
const page = () => ({ body: shell, type: 'text/html; charset=utf-8', headers: NO_STORE });

const assets = Object.fromEntries(
  readdirSync(dist, { recursive: true })
    .filter((file) => file !== 'index.html' && statSync(new URL(file, dist)).isFile())
    .map((file) => {
      const body = readFileSync(new URL(file, dist));
      const type = TYPES[file.split('.').pop()] ?? 'application/octet-stream';
      const hashed = file.startsWith('assets/');
      const answer = { body, type, headers: hashed ? IMMUTABLE : NO_CACHE };
      return [`GET /${file}`, { label: hashed ? '/assets/*' : `/${file}`, handler: () => answer }];
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
    'GET /': page,
    'GET /search': page,
    'GET /register': page,
    ...assets,

    // What the pages show from the seed file.
    'GET /api/site': () => ({ json: { title, description, suggestions }, headers: NO_STORE }),

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
