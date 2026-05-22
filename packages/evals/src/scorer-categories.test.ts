import { describe, expect, it } from 'vitest';

import {
  computeCategoryAverages,
  normalizeScoreForAvg,
  RETRIEVAL_SCORERS,
  SCORER_CATEGORIES,
} from './scorer-categories';

describe('SCORER_CATEGORIES', () => {
  it('classifies response quality scorers', () => {
    expect(SCORER_CATEGORIES.answerRelevancy.category).toBe('response');
    expect(SCORER_CATEGORIES.faithfulness.category).toBe('response');
    expect(SCORER_CATEGORIES.hallucination.category).toBe('response');
  });

  it('classifies retrieval quality scorers', () => {
    expect(SCORER_CATEGORIES.contextRelevance.category).toBe('retrieval');
    expect(SCORER_CATEGORIES.contextPrecision.category).toBe('retrieval');
  });

  it('marks hallucination as inverted scale', () => {
    expect(SCORER_CATEGORIES.hallucination.invertedScale).toBe(true);
  });

  it('does not mark other scorers as inverted', () => {
    expect(SCORER_CATEGORIES.answerRelevancy.invertedScale).toBeUndefined();
    expect(SCORER_CATEGORIES.faithfulness.invertedScale).toBeUndefined();
  });
});

describe('RETRIEVAL_SCORERS', () => {
  it('contains only retrieval scorers', () => {
    expect(RETRIEVAL_SCORERS.has('contextRelevance')).toBe(true);
    expect(RETRIEVAL_SCORERS.has('contextPrecision')).toBe(true);
    expect(RETRIEVAL_SCORERS.has('faithfulness')).toBe(false);
    expect(RETRIEVAL_SCORERS.has('hallucination')).toBe(false);
    expect(RETRIEVAL_SCORERS.has('answerRelevancy')).toBe(false);
  });
});

describe('normalizeScoreForAvg', () => {
  it('inverts hallucination score', () => {
    expect(normalizeScoreForAvg('hallucination', 0.8)).toBeCloseTo(0.2);
    expect(normalizeScoreForAvg('hallucination', 0.0)).toBeCloseTo(1.0);
    expect(normalizeScoreForAvg('hallucination', 1.0)).toBeCloseTo(0.0);
  });

  it('does not invert other scorers', () => {
    expect(normalizeScoreForAvg('faithfulness', 0.8)).toBe(0.8);
    expect(normalizeScoreForAvg('answerRelevancy', 0.6)).toBe(0.6);
    expect(normalizeScoreForAvg('contextRelevance', 0.5)).toBe(0.5);
  });

  it('returns raw score for unknown scorers', () => {
    expect(normalizeScoreForAvg('custom-scorer', 0.7)).toBe(0.7);
  });
});

describe('computeCategoryAverages', () => {
  it('computes separate averages for response and retrieval', () => {
    const scores = [
      { scorerId: 'answerRelevancy', score: 0.8 },
      { scorerId: 'faithfulness', score: 0.9 },
      { scorerId: 'hallucination', score: 0.1 }, // inverted: 0.9
      { scorerId: 'contextRelevance', score: 0.7 },
      { scorerId: 'contextPrecision', score: 0.8 },
    ];

    const result = computeCategoryAverages(scores);
    // Response: (0.8 + 0.9 + (1-0.1)) / 3 = (0.8 + 0.9 + 0.9) / 3 ≈ 0.867
    expect(result.responseAvg).toBeCloseTo(0.867, 2);
    // Retrieval: (0.7 + 0.8) / 2 = 0.75
    expect(result.retrievalAvg).toBeCloseTo(0.75);
  });

  it('returns null for retrieval when no retrieval scores', () => {
    const scores = [
      { scorerId: 'answerRelevancy', score: 0.85 },
      { scorerId: 'faithfulness', score: 0.0 },
      { scorerId: 'hallucination', score: 1.0 }, // inverted: 0.0
    ];

    const result = computeCategoryAverages(scores);
    // Response: (0.85 + 0.0 + 0.0) / 3 ≈ 0.283
    expect(result.responseAvg).toBeCloseTo(0.283, 2);
    expect(result.retrievalAvg).toBeNull();
  });

  it('excludes null scores from averages', () => {
    const scores = [
      { scorerId: 'answerRelevancy', score: 0.8 },
      { scorerId: 'faithfulness', score: 0.6 },
      { scorerId: 'hallucination', score: 0.2 }, // inverted: 0.8
      { scorerId: 'contextRelevance', score: null },
      { scorerId: 'contextPrecision', score: null },
    ];

    const result = computeCategoryAverages(scores);
    expect(result.responseAvg).toBeCloseTo(0.733, 2);
    expect(result.retrievalAvg).toBeNull();
  });

  it('excludes unknown scorers from category averages', () => {
    const scores = [
      { scorerId: 'answerRelevancy', score: 0.8 },
      { scorerId: 'custom-tone', score: 0.95 },
    ];

    const result = computeCategoryAverages(scores);
    expect(result.responseAvg).toBeCloseTo(0.8);
    expect(result.retrievalAvg).toBeNull();
  });

  it('returns null for both when scores array is empty', () => {
    const result = computeCategoryAverages([]);
    expect(result.responseAvg).toBeNull();
    expect(result.retrievalAvg).toBeNull();
  });
});
