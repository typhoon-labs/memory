import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';

import { dashboardCache } from '../lib/cache';
import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getDashboardService } from '../services';

/** Default date range: 30 days ago → now. */
function parseDateRange(c: { req: { query(key: string): string | undefined } }) {
  const now = new Date();
  const dateTo = c.req.query('dateTo') ?? now.toISOString();
  const dateFrom = c.req.query('dateFrom') ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const range = c.req.query('range') ?? '30d';
  return { dateFrom, dateTo, range };
}

export const dashboardRoutes = [
  registerApiRoute('/v1/admin/dashboard/scores', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const scorerId = c.req.query('scorerId');
      const cacheKey = `dashboard:scores:${dateFrom}:${dateTo}:${range}:${scorerId ?? ''}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getDashboardService().getScoreSeries({ dateFrom, dateTo, range, scorerId });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/dashboard/threads', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const limit = Math.min(Number(c.req.query('limit') ?? '10'), 50);
      const cacheKey = `dashboard:threads:${dateFrom}:${dateTo}:${limit}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getDashboardService().getWorstThreads({ dateFrom, dateTo, limit });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/dashboard/users', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50);
      const cacheKey = `dashboard:users:${dateFrom}:${dateTo}:${limit}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getDashboardService().getUserQuality({ dateFrom, dateTo, limit });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/dashboard/latency', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const cacheKey = `dashboard:latency:${dateFrom}:${dateTo}:${range}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getDashboardService().getLatencySeries({ dateFrom, dateTo, range });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/dashboard/cost', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const cacheKey = `dashboard:cost:${dateFrom}:${dateTo}:${range}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const result = await getDashboardService().getCostSeries({ dateFrom, dateTo, range });
      if (isError(result)) return errorResponse(c, result);
      dashboardCache.set(cacheKey, result.data);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/admin/dashboard/documents', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      return c.json({
        documents: [],
        message: 'Per-document quality analytics coming in a future phase.',
      });
    },
  }),
];
