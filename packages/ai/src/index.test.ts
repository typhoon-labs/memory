import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockModelFn = vi.fn((id: string) => ({ modelId: id }));
const mockEmbeddingModelFn = vi.fn((id: string) => ({ embeddingModelId: id }));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => {
    const provider = mockModelFn as unknown as ReturnType<
      typeof import('@ai-sdk/openai-compatible').createOpenAICompatible
    >;
    (provider as Record<string, unknown>).textEmbeddingModel = mockEmbeddingModelFn;
    return provider;
  }),
}));

describe('model factories', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockModelFn.mockClear();
    mockEmbeddingModelFn.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('createChatModel uses default model when env not set', async () => {
    delete process.env.LLM_CHAT_MODEL;
    const { createChatModel } = await import('./index.js');
    createChatModel();
    expect(mockModelFn).toHaveBeenCalledWith('anthropic.claude-sonnet-4-6');
  });

  it('createChatModel uses env model when set', async () => {
    process.env.LLM_CHAT_MODEL = 'custom-model';
    const { createChatModel } = await import('./index.js');
    createChatModel();
    expect(mockModelFn).toHaveBeenCalledWith('custom-model');
  });

  it('createChatModel uses explicit modelId over env', async () => {
    process.env.LLM_CHAT_MODEL = 'env-model';
    const { createChatModel } = await import('./index.js');
    createChatModel('explicit-model');
    expect(mockModelFn).toHaveBeenCalledWith('explicit-model');
  });

  it('createTitleModel reads LLM_TITLE_MODEL', async () => {
    process.env.LLM_TITLE_MODEL = 'title-model';
    const { createTitleModel } = await import('./index.js');
    createTitleModel();
    expect(mockModelFn).toHaveBeenCalledWith('title-model');
  });

  it('createRerankerScorer reads reranker env vars', async () => {
    process.env.RERANKER_BASE_URL = 'http://localhost:8787/v1';
    process.env.RERANKER_MODEL = 'bedrock/amazon.rerank-v1:0';
    process.env.LLM_API_KEY = 'test-key';
    const { createRerankerScorer } = await import('./index.js');
    const scorer = createRerankerScorer();
    expect(scorer).toBeDefined();
    expect(scorer).toHaveProperty('getRelevanceScore');
  });

  it('createExtractionModel reads LLM_EXTRACTION_MODEL', async () => {
    process.env.LLM_EXTRACTION_MODEL = 'extraction-model';
    const { createExtractionModel } = await import('./index.js');
    createExtractionModel();
    expect(mockModelFn).toHaveBeenCalledWith('extraction-model');
  });

  it('createGuardrailModel reads LLM_GUARDRAIL_MODEL', async () => {
    process.env.LLM_GUARDRAIL_MODEL = 'guardrail-model';
    const { createGuardrailModel } = await import('./index.js');
    createGuardrailModel();
    expect(mockModelFn).toHaveBeenCalledWith('guardrail-model');
  });

  it('createKnowledgeModel reads LLM_KNOWLEDGE_MODEL', async () => {
    process.env.LLM_KNOWLEDGE_MODEL = 'knowledge-model';
    const { createKnowledgeModel } = await import('./index.js');
    createKnowledgeModel();
    expect(mockModelFn).toHaveBeenCalledWith('knowledge-model');
  });

  it('createKnowledgeModel falls back to default chat model when LLM_KNOWLEDGE_MODEL not set', async () => {
    delete process.env.LLM_KNOWLEDGE_MODEL;
    delete process.env.LLM_CHAT_MODEL;
    const { createKnowledgeModel } = await import('./index.js');
    createKnowledgeModel();
    expect(mockModelFn).toHaveBeenCalledWith('anthropic.claude-sonnet-4-6');
  });

  it('createCitationModel reads LLM_CITATION_MODEL', async () => {
    process.env.LLM_CITATION_MODEL = 'citation-model';
    const { createCitationModel } = await import('./index.js');
    createCitationModel();
    expect(mockModelFn).toHaveBeenCalledWith('citation-model');
  });

  it('createCitationModel falls back to default chat model when LLM_CITATION_MODEL not set', async () => {
    delete process.env.LLM_CITATION_MODEL;
    delete process.env.LLM_CHAT_MODEL;
    const { createCitationModel } = await import('./index.js');
    createCitationModel();
    expect(mockModelFn).toHaveBeenCalledWith('anthropic.claude-sonnet-4-6');
  });

  it('createEmbeddingModel uses default model when env not set', async () => {
    delete process.env.EMBEDDING_MODEL;
    const { createEmbeddingModel } = await import('./index.js');
    createEmbeddingModel();
    expect(mockEmbeddingModelFn).toHaveBeenCalledWith('amazon.titan-embed-text-v2:0');
  });

  it('createEmbeddingModel uses env model when set', async () => {
    process.env.EMBEDDING_MODEL = 'custom-embedding';
    const { createEmbeddingModel } = await import('./index.js');
    createEmbeddingModel();
    expect(mockEmbeddingModelFn).toHaveBeenCalledWith('custom-embedding');
  });

  it('EMBEDDING_DIMENSION defaults to 1024', async () => {
    delete process.env.EMBEDDING_DIMENSION;
    const { EMBEDDING_DIMENSION } = await import('./index.js');
    expect(EMBEDDING_DIMENSION).toBe(1024);
  });

  it('createTitleModel falls back to default chat model when LLM_TITLE_MODEL not set', async () => {
    delete process.env.LLM_TITLE_MODEL;
    delete process.env.LLM_CHAT_MODEL;
    const { createTitleModel } = await import('./index.js');
    createTitleModel();
    // undefined env → falls through to default
    expect(mockModelFn).toHaveBeenCalledWith('anthropic.claude-sonnet-4-6');
  });

  it('createRerankerScorer uses RERANKER_API_KEY over LLM_API_KEY', async () => {
    process.env.RERANKER_BASE_URL = 'http://localhost:8787/v1';
    process.env.RERANKER_API_KEY = 'reranker-key';
    process.env.LLM_API_KEY = 'llm-key';
    process.env.RERANKER_MODEL = 'bedrock/amazon.rerank-v1:0';
    const { createRerankerScorer } = await import('./index.js');
    const scorer = createRerankerScorer();
    expect(scorer).toBeDefined();
  });

  it('createEmbeddingModel uses explicit modelId over env', async () => {
    process.env.EMBEDDING_MODEL = 'env-model';
    const { createEmbeddingModel } = await import('./index.js');
    createEmbeddingModel('explicit-embedding');
    expect(mockEmbeddingModelFn).toHaveBeenCalledWith('explicit-embedding');
  });

  it('exports embedding constraint constants with defaults', async () => {
    const { EMBEDDING_MAX_TOKENS, EMBEDDING_MAX_CHARS } = await import('./index.js');
    expect(EMBEDDING_MAX_TOKENS).toBe(8_192);
    expect(EMBEDDING_MAX_CHARS).toBe(50_000);
  });

  it('createScoringModel reads LLM_SCORING_MODEL', async () => {
    process.env.LLM_SCORING_MODEL = 'scoring-model';
    const { createScoringModel } = await import('./index.js');
    createScoringModel();
    expect(mockModelFn).toHaveBeenCalledWith('scoring-model');
  });

  it('createScoringModel falls back to default chat model when LLM_SCORING_MODEL not set', async () => {
    delete process.env.LLM_SCORING_MODEL;
    delete process.env.LLM_CHAT_MODEL;
    const { createScoringModel } = await import('./index.js');
    createScoringModel();
    expect(mockModelFn).toHaveBeenCalledWith('anthropic.claude-sonnet-4-6');
  });

  it('createScoringModel uses explicit modelId over env', async () => {
    process.env.LLM_SCORING_MODEL = 'env-scoring';
    const { createScoringModel } = await import('./index.js');
    createScoringModel('explicit-scoring');
    expect(mockModelFn).toHaveBeenCalledWith('explicit-scoring');
  });

  it('RAG_RERANK_CANDIDATES defaults to 100', async () => {
    delete process.env.RAG_RERANK_CANDIDATES;
    const { RAG_RERANK_CANDIDATES } = await import('./index.js');
    expect(RAG_RERANK_CANDIDATES).toBe(100);
  });

  it('RAG_RERANK_CANDIDATES reads from env', async () => {
    process.env.RAG_RERANK_CANDIDATES = '75';
    const { RAG_RERANK_CANDIDATES } = await import('./index.js');
    expect(RAG_RERANK_CANDIDATES).toBe(75);
  });

  it('RAG_RERANK_CANDIDATES_EXPANDED defaults to 200', async () => {
    delete process.env.RAG_RERANK_CANDIDATES_EXPANDED;
    const { RAG_RERANK_CANDIDATES_EXPANDED } = await import('./index.js');
    expect(RAG_RERANK_CANDIDATES_EXPANDED).toBe(200);
  });
});
