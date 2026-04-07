import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/** Default chat model ID (Anthropic on Bedrock). */
const DEFAULT_CHAT_MODEL = 'anthropic.claude-sonnet-4-6-v1:0';

/** Default embedding model ID (Titan V2 on Bedrock). */
const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

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

/** Embedding vector dimension from environment (default: 1024 for Titan V2). */
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 1024);
