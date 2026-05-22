import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';

import { dashboardCache } from '../lib/cache';
import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getTraceService } from '../services';

/** Default date range: 30 days ago → now. */
function parseDateRange(c: { req: { query(key: string): string | undefined } }) {
  const now = new Date();
  const dateTo = c.req.query('dateTo') ?? now.toISOString();
  const dateFrom = c.req.query('dateFrom') ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return { dateFrom, dateTo };
}

export const traceRoutes = [
  registerApiRoute('/v1/admin/traces', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const page = Math.max(0, Number(c.req.query('page') ?? '0'));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '50')));
      const status = c.req.query('status');
      const entityType = c.req.query('entityType');
      const spanType = c.req.query('spanType');
      const minDurationMs = c.req.query('minDurationMs') ? Number(c.req.query('minDurationMs')) : undefined;
      const maxDurationMs = c.req.query('maxDurationMs') ? Number(c.req.query('maxDurationMs')) : undefined;
      const search = c.req.query('search');
      const threadId = c.req.query('threadId');

      const cacheKey = `traces:list:${dateFrom}:${dateTo}:${page}:${perPage}:${status ?? ''}:${entityType ?? ''}:${spanType ?? ''}:${minDurationMs ?? ''}:${maxDurationMs ?? ''}:${search ?? ''}:${threadId ?? ''}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getTraceService().listTraces({
        dateFrom,
        dateTo,
        page,
        perPage,
        status,
        entityType,
        spanType,
        minDurationMs,
        maxDurationMs,
        search,
        threadId,
      });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data, 30_000);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/traces/:traceId', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const traceId = c.req.param('traceId');
      const result = await getTraceService().getDetail(traceId);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
