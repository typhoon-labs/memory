import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { RerankerScorer } from './reranker-scorer';

/** Default chat model ID (Anthropic on Bedrock). */
const DEFAULT_CHAT_MODEL = 'anthropic.claude-sonnet-4-6';

/** Default embedding model ID (Titan V2 on Bedrock). */
const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

/** Maximum input tokens accepted by the embedding model. Default: 8,192 (Titan V2). */
export const EMBEDDING_MAX_TOKENS = Number(process.env.EMBEDDING_MAX_TOKENS ?? 8_192);

/** Maximum input characters accepted by the embedding model. Default: 50,000 (Titan V2). */
export const EMBEDDING_MAX_CHARS = Number(process.env.EMBEDDING_MAX_CHARS ?? 50_000);

/**
 * Creates a chat model via the configured OpenAI-compatible LLM gateway.
 *
 * Reads from environment:
 * - `LLM_BASE_URL` — gateway endpoint (e.g. Bifrost)
 * - `LLM_API_KEY` — gateway auth key
 * - `LLM_CHAT_MODEL` — model ID (default: anthropic/claude-sonnet-4-6)
 */
export function createChatModel(modelId?: string) {
  const provider = createOpenAICompatible({
    name: 'llm',
    baseURL: process.env.LLM_BASE_URL ?? '',
    apiKey: process.env.LLM_API_KEY ?? '',
  });
  return provider(modelId ?? process.env.LLM_CHAT_MODEL ?? DEFAULT_CHAT_MODEL);
}

/**
 * Creates a lightweight chat model for auxiliary tasks (e.g. title generation).
 * Uses `LLM_TITLE_MODEL` if set, otherwise falls back to the default chat model.
 */
export function createTitleModel() {
  return createChatModel(process.env.LLM_TITLE_MODEL);
}

/**
 * Creates an embedding model via the configured OpenAI-compatible endpoint.
 *
 * Reads from environment:
 * - `EMBEDDING_BASE_URL` — embedding endpoint
 * - `EMBEDDING_API_KEY` — auth key
 * - `EMBEDDING_MODEL` — model ID (default: amazon.titan-embed-text-v2:0)
 */
export function createEmbeddingModel(modelId?: string) {
  const provider = createOpenAICompatible({
    name: 'embedding',
    baseURL: process.env.EMBEDDING_BASE_URL ?? '',
    apiKey: process.env.EMBEDDING_API_KEY ?? '',
  });
  return provider.textEmbeddingModel(modelId ?? process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL);
}

/**
 * Creates a dedicated reranker scorer via the configured rerank gateway.
 *
 * Reads from environment:
 * - `RERANKER_BASE_URL` — rerank gateway endpoint (e.g. Bifrost)
 * - `RERANKER_API_KEY` — auth key (falls back to `LLM_API_KEY`)
 * - `RERANKER_MODEL` — reranker model ID (e.g. `bedrock/cohere.rerank-v3-5:0`)
 */
export function createRerankerScorer() {
  return new RerankerScorer(
    process.env.RERANKER_BASE_URL ?? '',
    process.env.RERANKER_API_KEY ?? process.env.LLM_API_KEY ?? '',
    process.env.RERANKER_MODEL ?? '',
  );
}

export { RerankerScorer } from './reranker-scorer';

/**
 * Creates a chat model for metadata extraction during ingestion (title, keywords).
 * Uses `LLM_EXTRACTION_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a cheap/fast model to control ingestion cost.
 */
export function createExtractionModel() {
  return createChatModel(process.env.LLM_EXTRACTION_MODEL);
}

/**
 * Creates a chat model for guardrail processors (moderation, PII, prompt injection).
 * Uses `LLM_GUARDRAIL_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a fast model to minimize latency on every request.
 */
export function createGuardrailModel() {
  return createChatModel(process.env.LLM_GUARDRAIL_MODEL);
}

/**
 * Creates a chat model for the knowledge agent (search tool routing).
 * Uses `LLM_KNOWLEDGE_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a fast model — the knowledge agent just picks between search tools.
 */
export function createKnowledgeModel() {
  return createChatModel(process.env.LLM_KNOWLEDGE_MODEL);
}

/**
 * Creates a chat model for citation generation (synthesizing search results).
 * Uses `LLM_CITATION_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a fast model — citation is structured synthesis, not reasoning.
 */
export function createCitationModel() {
  return createChatModel(process.env.LLM_CITATION_MODEL);
}

/**
 * Creates a chat model for RAG scoring / evaluation.
 * Uses `LLM_SCORING_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a cost-efficient model — scoring runs on every agent response.
 */
export function createScoringModel(modelId?: string) {
  return createChatModel(modelId ?? process.env.LLM_SCORING_MODEL);
}

/** Embedding vector dimension from environment. Default: 1024. */
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1024);

// ---------------------------------------------------------------------------
// RAG tuning knobs (env-configurable, see @typhoon/config ragSchema)
// ---------------------------------------------------------------------------

/** Reranker weight for semantic (Cohere) relevance score. Default: 1.0. */
export const RAG_RERANK_WEIGHT_SEMANTIC = Number(process.env.RAG_RERANK_WEIGHT_SEMANTIC ?? 1.0);

/** Reranker weight for original vector/RRF score. Default: 0. */
export const RAG_RERANK_WEIGHT_VECTOR = Number(process.env.RAG_RERANK_WEIGHT_VECTOR ?? 0);

/** Reranker weight for positional rank score. Default: 0. */
export const RAG_RERANK_WEIGHT_POSITION = Number(process.env.RAG_RERANK_WEIGHT_POSITION ?? 0);

/** Convenience object for Mastra's rerankWithScorer `weights` option. */
export const RAG_RERANK_WEIGHTS = {
  semantic: RAG_RERANK_WEIGHT_SEMANTIC,
  vector: RAG_RERANK_WEIGHT_VECTOR,
  position: RAG_RERANK_WEIGHT_POSITION,
};

/** Minimum reranker score to keep a result. Default: 0.1. */
export const RAG_RERANK_MIN_SCORE = Number(process.env.RAG_RERANK_MIN_SCORE ?? 0.1);

/** Minimum vector similarity score for API search endpoint. Default: 0.6. */
export const RAG_VECTOR_MIN_SCORE = Number(process.env.RAG_VECTOR_MIN_SCORE ?? 0.6);

/** Minimum vector similarity score for agent basic vector tool. Default: 0.5. */
export const RAG_VECTOR_MIN_SCORE_AGENT = Number(process.env.RAG_VECTOR_MIN_SCORE_AGENT ?? 0.5);

/** Graph RAG similarity threshold. Default: 0.7. */
export const RAG_GRAPH_THRESHOLD = Number(process.env.RAG_GRAPH_THRESHOLD ?? 0.7);

/** Maximum results returned by knowledge search tool. Default: 10. */
export const RAG_KNOWLEDGE_MAX_RESULTS = Number(process.env.RAG_KNOWLEDGE_MAX_RESULTS ?? 10);

/** Fixed number of candidates to retrieve when a reranker will process results. Default: 100. */
export const RAG_RERANK_CANDIDATES = Number(process.env.RAG_RERANK_CANDIDATES ?? 100);

/** Expanded candidate pool for deep/thorough search mode. Default: 200. */
export const RAG_RERANK_CANDIDATES_EXPANDED = Number(process.env.RAG_RERANK_CANDIDATES_EXPANDED ?? 200);
