import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/** Default chat model ID (Anthropic on Bedrock). */
const DEFAULT_CHAT_MODEL = 'anthropic.claude-sonnet-4-6-v1:0';

/** Default embedding model ID (Titan V2 on Bedrock). */
const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

/** Titan V2 maximum input tokens per chunk. */
export const EMBEDDING_MAX_TOKENS = 8_192;

/** Titan V2 maximum input characters per chunk. */
export const EMBEDDING_MAX_CHARS = 50_000;

/** Titan V2 supported output dimension values. */
export const EMBEDDING_SUPPORTED_DIMENSIONS = [256, 512, 1024] as const;

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
 * Creates a chat model for reranking retrieved chunks.
 * Uses `LLM_RERANKER_MODEL` if set, otherwise falls back to the default chat model.
 */
export function createRerankerModel() {
  return createChatModel(process.env.LLM_RERANKER_MODEL);
}

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

/** Embedding vector dimension from environment (default: 1024 for Titan V2). */
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1024);

/**
 * Maximum characters per chunk before embedding. Configurable per model:
 * - Titan V2: 24,000 (conservative for 8,192 token / 50K char limit)
 * - Nomic: 32,000 (8,192 token context, generous char-to-token ratio)
 */
export const EMBEDDING_MAX_CHUNK_CHARS = Number(process.env.EMBEDDING_MAX_CHUNK_CHARS ?? 24_000);
