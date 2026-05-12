/** Scorer category for grouping and averaging. */
export type ScorerCategory = 'response' | 'retrieval';

interface ScorerCategoryConfig {
  category: ScorerCategory;
  /** If true, score is inverted (1 - score) before averaging. E.g. hallucination: 1.0 = bad. */
  invertedScale?: boolean;
}

/** Category config for built-in scorers. Custom scorers are excluded from category averages. */
export const SCORER_CATEGORIES: Record<string, ScorerCategoryConfig> = {
  answerRelevancy: { category: 'response' },
  faithfulness: { category: 'response' },
  hallucination: { category: 'response', invertedScale: true },
  contextRelevance: { category: 'retrieval' },
  contextPrecision: { category: 'retrieval' },
};

/** Retrieval quality scorers — require non-empty context to run. */
export const RETRIEVAL_SCORERS = new Set(
  Object.entries(SCORER_CATEGORIES)
    .filter(([, c]) => c.category === 'retrieval')
    .map(([k]) => k),
);

/** Normalize a raw score for averaging (inverts hallucination). */
export function normalizeScoreForAvg(scorerId: string, rawScore: number): number {
  const config = SCORER_CATEGORIES[scorerId];
  return config?.invertedScale ? 1 - rawScore : rawScore;
}

/** Compute per-category averages from a scores array. */
export function computeCategoryAverages(scores: Array<{ scorerId: string; score: number | null }>): {
  responseAvg: number | null;
  retrievalAvg: number | null;
} {
  let responseSum = 0;
  let responseCount = 0;
  let retrievalSum = 0;
  let retrievalCount = 0;

  for (const s of scores) {
    if (s.score === null) continue;
    const config = SCORER_CATEGORIES[s.scorerId];
    if (!config) continue;

    if (config.category === 'response') {
      responseSum += normalizeScoreForAvg(s.scorerId, s.score);
      responseCount++;
    } else {
      retrievalSum += s.score;
      retrievalCount++;
    }
  }

  return {
    responseAvg: responseCount > 0 ? responseSum / responseCount : null,
    retrievalAvg: retrievalCount > 0 ? retrievalSum / retrievalCount : null,
  };
}
