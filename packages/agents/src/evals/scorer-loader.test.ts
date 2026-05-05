import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockFactories } = vi.hoisted(() => ({
  mockFactories: {
    createFaithfulnessScorer: vi.fn(() => ({ type: 'faithfulness' })),
    createHallucinationScorer: vi.fn(() => ({ type: 'hallucination' })),
    createAnswerRelevancyScorer: vi.fn(() => ({ type: 'answerRelevancy' })),
    createContextRelevanceScorerLLM: vi.fn(() => ({ type: 'contextRelevance' })),
    createContextPrecisionScorer: vi.fn(() => ({ type: 'contextPrecision' })),
  },
}));

// ---------- Module mocks ----------
vi.mock('@mastra/evals/scorers/prebuilt', () => mockFactories);

import type { ScorerDefinitionVersion } from './scorer-loader';
import { constructScorer, mapScorerRows } from './scorer-loader';

// ---------- Helpers ----------
function makeDefinition(overrides: Partial<ScorerDefinitionVersion> = {}): ScorerDefinitionVersion {
  return {
    id: 'scorer-1',
    name: 'test-scorer',
    type: 'faithfulness',
    description: 'A test scorer',
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
    ...overrides,
  };
}

const mockModel = { provider: 'openai', name: 'gpt-4' } as never;

// ---------- Tests ----------
describe('constructScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('context-dependent types', () => {
    for (const type of ['faithfulness', 'hallucination', 'contextRelevance', 'contextPrecision']) {
      it(`returns null for "${type}" when context is empty`, () => {
        const result = constructScorer(makeDefinition({ type }), mockModel, []);
        expect(result).toBeNull();
      });
    }

    it('returns scorer for context-dependent type when context is non-empty', () => {
      const result = constructScorer(makeDefinition({ type: 'faithfulness' }), mockModel, ['some context']);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-scorer');
    });
  });

  describe('prebuilt types', () => {
    it('creates faithfulness scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'faithfulness', name: 'faith' }), mockModel, context);
      expect(mockFactories.createFaithfulnessScorer).toHaveBeenCalledWith({ model: mockModel, options: { context } });
    });

    it('creates hallucination scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'hallucination', name: 'halluc' }), mockModel, context);
      expect(mockFactories.createHallucinationScorer).toHaveBeenCalledWith({ model: mockModel, options: { context } });
    });

    it('creates answerRelevancy scorer with model only', () => {
      constructScorer(makeDefinition({ type: 'answerRelevancy', name: 'ar' }), mockModel, []);
      expect(mockFactories.createAnswerRelevancyScorer).toHaveBeenCalledWith({ model: mockModel });
    });

    it('creates contextRelevance scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'contextRelevance', name: 'cr' }), mockModel, context);
      expect(mockFactories.createContextRelevanceScorerLLM).toHaveBeenCalledWith({
        model: mockModel,
        options: { context },
      });
    });

    it('creates contextPrecision scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'contextPrecision', name: 'cp' }), mockModel, context);
      expect(mockFactories.createContextPrecisionScorer).toHaveBeenCalledWith({
        model: mockModel,
        options: { context },
      });
    });

    it('uses definition.name as the scorer id', () => {
      const result = constructScorer(makeDefinition({ type: 'answerRelevancy', name: 'my-scorer' }), mockModel, []);
      expect(result?.id).toBe('my-scorer');
    });
  });

  describe('custom type', () => {
    it('creates custom scorer with instructions', () => {
      const def = makeDefinition({ type: 'custom', name: 'tone-check', instructions: 'Check tone' });
      const result = constructScorer(def, mockModel, []);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('tone-check');
      expect(result?.scorer).toBeDefined();
    });

    it('returns null when custom type has no instructions', () => {
      const def = makeDefinition({ type: 'custom', name: 'no-instr', instructions: null });
      const result = constructScorer(def, mockModel, []);
      expect(result).toBeNull();
    });
  });

  describe('unknown type', () => {
    it('returns null for unknown scorer type', () => {
      const result = constructScorer(makeDefinition({ type: 'nonexistent' }), mockModel, ['ctx']);
      expect(result).toBeNull();
    });
  });
});

describe('mapScorerRows', () => {
  it('maps raw SQL rows to ScorerDefinitionVersion objects', () => {
    const rows = [
      {
        id: 's-1',
        name: 'faith',
        type: 'faithfulness',
        description: 'Checks faithfulness',
        model: { provider: 'openai' },
        instructions: 'Be faithful',
        score_range: { min: 0, max: 1 },
        preset_config: { key: 'value' },
        default_sampling: { strategy: 'random' },
      },
    ];

    const result = mapScorerRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 's-1',
      name: 'faith',
      type: 'faithfulness',
      description: 'Checks faithfulness',
      model: { provider: 'openai' },
      instructions: 'Be faithful',
      scoreRange: { min: 0, max: 1 },
      presetConfig: { key: 'value' },
      defaultSampling: { strategy: 'random' },
    });
  });

  it('defaults nullable fields to null', () => {
    const rows = [{ id: 's-2', name: 'minimal', type: 'custom' }];
    const result = mapScorerRows(rows);
    expect(result[0].description).toBeNull();
    expect(result[0].model).toBeNull();
    expect(result[0].instructions).toBeNull();
    expect(result[0].scoreRange).toBeNull();
    expect(result[0].presetConfig).toBeNull();
    expect(result[0].defaultSampling).toBeNull();
  });

  it('handles empty array', () => {
    expect(mapScorerRows([])).toEqual([]);
  });
});
