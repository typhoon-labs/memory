// search-service: GET /search?q= over the seed catalogue.
import { readFileSync } from 'node:fs';
import { createService, errorFields, log } from '../../lib/service.js';
import { strategy } from './ranking.js';
import { buildIndex, search } from './search.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Title and records come from the seed file, never from this code.
const seedFile = process.env.SEED_FILE || new URL('../../seed/catalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(seedFile, 'utf8'));
const index = buildIndex(catalog);

const service = createService({
  name: 'search-service',
  routes: {
    'GET /search': ({ query, span }) => {
      const q = (query.get('q') ?? '').trim().slice(0, 100);
      const requested = Number.parseInt(query.get('limit') ?? '', 10);
      const limit = Number.isNaN(requested) ? DEFAULT_LIMIT : Math.min(Math.max(requested, 0), MAX_LIMIT);
      span.setAttribute('search.query', q);

      try {
        const { count, results } = search(catalog, index, q, limit);
        if (q && count === 0) zeroResults.inc();
        span.setAttribute('search.result_count', count);
        return {
          json: { query: q, count, indexed: index.length, results, title: catalog.title, version: service.version },
        };
      } catch (err) {
        span.recordException(err);
        log.error('search failed', { query: q, ...errorFields(err) });
        return { status: 500, json: { error: 'search_failed', message: 'Search failed', trace_id: span.traceId } };
      }
    },
  },
});

const zeroResults = service.metrics.counter('search_zero_results_total', 'Searches with a query that matched no record.');
zeroResults.inc({}, 0);
service.metrics.gauge('search_records_indexed', 'Records loaded from the seed file.', () => index.length);

log.info('catalogue loaded', { title: catalog.title, records: index.length, ranking: strategy });
await service.listen();
