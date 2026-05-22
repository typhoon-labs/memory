import { describe, expect, it, vi } from 'vitest';

const mockFaithfulness = { id: 'faithfulness' };
const mockHallucination = { id: 'hallucination' };
const mockAnswerRelevancy = { id: 'answerRelevancy' };
const mockContextRelevance = { id: 'contextRelevance' };
const mockContextPrecision = { id: 'contextPrecision' };

vi.mock('@mastra/evals/scorers/prebuilt', () => ({
  createFaithfulnessScorer: vi.fn(() => mockFaithfulness),
  createHallucinationScorer: vi.fn(() => mockHallucination),
  createAnswerRelevancyScorer: vi.fn(() => mockAnswerRelevancy),
  createContextRelevanceScorerLLM: vi.fn(() => mockContextRelevance),
  createContextPrecisionScorer: vi.fn(() => mockContextPrecision),
}));

import {
  createAnswerRelevancyScorer,
  createContextPrecisionScorer,
  createContextRelevanceScorerLLM,
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';

import { createRagScorers } from './scorers';

describe('createRagScorers', () => {
  const fakeModel = { model: 'test-model' } as never;

  it('returns all 5 scorers', () => {
    const scorers = createRagScorers(fakeModel);
    expect(Object.keys(scorers)).toEqual([
      'faithfulness',
      'hallucination',
      'answerRelevancy',
      'contextRelevance',
      'contextPrecision',
    ]);
  });

  it('passes model to each scorer factory', () => {
    createRagScorers(fakeModel);
    expect(createFaithfulnessScorer).toHaveBeenCalledWith({ model: fakeModel });
    expect(createHallucinationScorer).toHaveBeenCalledWith({ model: fakeModel });
    expect(createAnswerRelevancyScorer).toHaveBeenCalledWith({ model: fakeModel });
  });

  it('passes model and options to context scorers', () => {
    createRagScorers(fakeModel);
    expect(createContextRelevanceScorerLLM).toHaveBeenCalledWith({ model: fakeModel, options: {} });
    expect(createContextPrecisionScorer).toHaveBeenCalledWith({ model: fakeModel, options: {} });
  });

  it('returns the actual scorer instances', () => {
    const scorers = createRagScorers(fakeModel);
    expect(scorers.faithfulness).toBe(mockFaithfulness);
    expect(scorers.hallucination).toBe(mockHallucination);
    expect(scorers.answerRelevancy).toBe(mockAnswerRelevancy);
    expect(scorers.contextRelevance).toBe(mockContextRelevance);
    expect(scorers.contextPrecision).toBe(mockContextPrecision);
  });
});
