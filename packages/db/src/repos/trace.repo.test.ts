import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TraceListFilters } from './trace.repo';
import { TraceRepo } from './trace.repo';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe('TraceRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: TraceRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new TraceRepo(db as any);
  });

  describe('listTraces', () => {
    const baseFilters: TraceListFilters = {
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      page: 0,
      perPage: 20,
    };

    it('returns rows and total with basic filters', async () => {
      const rows = [{ trace_id: 'trace-1', span_count: 3, status: 'success' }];
      db.execute.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ count: 1 }]);

      const result = await repo.listTraces(baseFilters);
      expect(result.rows).toEqual(rows);
      expect(result.total).toBe(1);
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('returns total 0 when count row is missing', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await repo.listTraces(baseFilters);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('includes status filter', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, status: 'error' });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('includes entityType filter', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, entityType: 'agent' });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('includes spanType filter', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, spanType: 'llm' });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('includes duration range filters', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, minDurationMs: 100, maxDurationMs: 5000 });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('includes search filter', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, search: 'agent' });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('includes threadId filter', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await repo.listTraces({ ...baseFilters, threadId: 'thread-1' });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('handles pagination parameters', async () => {
      db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 100 }]);

      await repo.listTraces({ ...baseFilters, page: 2, perPage: 10 });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSpansByTraceId', () => {
    it('calls db.execute with trace ID', async () => {
      const spans = [{ id: 'span-1', trace_id: 'trace-1' }];
      db.execute.mockResolvedValue(spans);

      const result = await repo.getSpansByTraceId('trace-1');
      expect(result).toEqual(spans);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });
});
