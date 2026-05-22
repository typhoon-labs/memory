import type { QueryResult } from '@mastra/core/vector';
import { describe, expect, it, vi } from 'vitest';

import { type RerankFn, refineResults } from './retrieval';

function makeResult(id: string, score: number, metadata?: Record<string, unknown>): QueryResult {
  return { id, score, metadata };
}

describe('refineResults', () => {
  const query = 'test query';

  it('returns input unchanged when no options provided', async () => {
    const results = [makeResult('a', 0.9), makeResult('b', 0.5), makeResult('c', 0.2)];
    const refined = await refineResults(results, query);
    expect(refined).toEqual(results);
  });

  it('returns empty array for empty input', async () => {
    const refined = await refineResults([], query, { minScore: 0.5 });
    expect(refined).toEqual([]);
  });

  describe('minScore filtering', () => {
    it('filters results below threshold', async () => {
      const results = [makeResult('a', 0.9), makeResult('b', 0.5), makeResult('c', 0.2)];
      const refined = await refineResults(results, query, { minScore: 0.5 });
      expect(refined).toHaveLength(2);
      expect(refined.map((r) => r.id)).toEqual(['a', 'b']);
    });

    it('keeps results at exact threshold', async () => {
      const results = [makeResult('a', 0.5)];
      const refined = await refineResults(results, query, { minScore: 0.5 });
      expect(refined).toHaveLength(1);
    });

    it('skips filter when minScore is 0', async () => {
      const results = [makeResult('a', 0.1)];
      const refined = await refineResults(results, query, { minScore: 0 });
      expect(refined).toHaveLength(1);
    });
  });

  describe('dedup by key', () => {
    it('deduplicates by metadata field keeping highest score', async () => {
      const results = [
        makeResult('a1', 0.9, { documentId: 'doc1' }),
        makeResult('a2', 0.7, { documentId: 'doc1' }),
        makeResult('b1', 0.8, { documentId: 'doc2' }),
      ];
      const refined = await refineResults(results, query, { dedupKey: 'documentId' });
      expect(refined).toHaveLength(2);
      expect(refined.find((r) => r.id === 'a1')).toBeDefined();
      expect(refined.find((r) => r.id === 'b1')).toBeDefined();
    });

    it('keeps results that lack the dedup key', async () => {
      const results = [
        makeResult('a1', 0.9, { documentId: 'doc1' }),
        makeResult('a2', 0.7, { documentId: 'doc1' }),
        makeResult('orphan', 0.5, {}),
      ];
      const refined = await refineResults(results, query, { dedupKey: 'documentId' });
      expect(refined).toHaveLength(2);
      expect(refined.find((r) => r.id === 'a1')).toBeDefined();
      expect(refined.find((r) => r.id === 'orphan')).toBeDefined();
    });

    it('keeps results with undefined metadata', async () => {
      const results = [makeResult('a', 0.9, { documentId: 'doc1' }), makeResult('b', 0.5)];
      const refined = await refineResults(results, query, { dedupKey: 'documentId' });
      expect(refined).toHaveLength(2);
    });
  });

  describe('reranker', () => {
    it('calls reranker and uses reranked scores', async () => {
      const results = [makeResult('a', 0.9), makeResult('b', 0.5)];
      const reranker: RerankFn = vi.fn().mockResolvedValue([
        { result: results[1], score: 0.95 },
        { result: results[0], score: 0.6 },
      ]);

      const refined = await refineResults(results, query, { reranker });
      expect(reranker).toHaveBeenCalledWith(results, query);
      expect(refined[0].id).toBe('b');
      expect(refined[0].score).toBe(0.95);
      expect(refined[1].id).toBe('a');
      expect(refined[1].score).toBe(0.6);
    });
  });

  describe('combined pipeline', () => {
    it('applies dedup → rerank → minScore in order', async () => {
      const results = [
        makeResult('a1', 0.9, { documentId: 'doc1' }),
        makeResult('a2', 0.8, { documentId: 'doc1' }),
        makeResult('b1', 0.6, { documentId: 'doc2' }),
        makeResult('c1', 0.2, { documentId: 'doc3' }),
      ];

      // Reranker multiplies scores — c1 stays below threshold after rerank
      const reranker: RerankFn = vi
        .fn()
        .mockImplementation(async (input: QueryResult[]) => input.map((r) => ({ result: r, score: r.score * 1.1 })));

      const refined = await refineResults(results, query, {
        minScore: 0.5,
        dedupKey: 'documentId',
        reranker,
      });

      // dedup keeps a1 (0.9), b1 (0.6), c1 (0.2) → 3 results
      // reranker receives [a1, b1, c1] → scores become [0.99, 0.66, 0.22]
      // minScore(0.5) removes c1 (0.22) → 2 results
      expect(reranker).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'a1' }),
          expect.objectContaining({ id: 'b1' }),
          expect.objectContaining({ id: 'c1' }),
        ]),
        query,
      );
      expect(refined).toHaveLength(2);
    });

    it('minScore applies to reranked scores, not raw RRF scores', async () => {
      // RRF scores are tiny fractions (0.001–0.02 range)
      const results = [makeResult('a', 0.012, { documentId: 'doc1' }), makeResult('b', 0.008, { documentId: 'doc2' })];

      // Reranker normalizes scores to 0-1 range
      const reranker: RerankFn = vi.fn().mockResolvedValue([
        { result: results[0], score: 0.9 },
        { result: results[1], score: 0.4 },
      ]);

      const refined = await refineResults(results, query, {
        minScore: 0.25,
        reranker,
      });

      // Without correct ordering, minScore(0.25) would kill both raw results.
      // With correct ordering (rerank first), only b (0.4) survives alongside a (0.9).
      expect(refined).toHaveLength(2);
      expect(refined[0].score).toBe(0.9);
      expect(refined[1].score).toBe(0.4);
    });
  });
});
