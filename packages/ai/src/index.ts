import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
export type { LanguageModel } from 'ai';

import { BedrockRerankerScorer } from './bedrock-reranker-scorer';
import { createInstrumentedFetch } from './instrumented-fetch';
import { RerankerScorer } from './reranker-scorer';

/** Default chat model ID (Anthropic on Bedrock). */
const DEFAULT_CHAT_MODEL = 'anthropic.claude-sonnet-4-6';

/** Default embedding model ID (Titan V2 on Bedrock). */
const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

/**
 * Returns `true` when an OpenAI-compatible gateway URL (e.g. Bifrost) is
 * configured. When `false`, models are created via the native Bedrock SDK
 * using the AWS credential provider chain (IRSA, instance profiles, env vars).
 */
const isGatewayMode = () => Boolean(process.env.LLM_BASE_URL);

/** Maximum input tokens accepted by the embedding model. Default: 8,192 (Titan V2). */
export const EMBEDDING_MAX_TOKENS = Number(process.env.EMBEDDING_MAX_TOKENS ?? 8_192);

/** Maximum input characters accepted by the embedding model. Default: 2,000 (~500 tokens for focused retrieval). */
export const EMBEDDING_MAX_CHARS = Number(process.env.EMBEDDING_MAX_CHARS ?? 2_000);

/** Maximum characters of parsed text sent to the LLM for metadata extraction (title, description, custom metadata). Default: 8,000. */
export const METADATA_EXTRACTION_MAX_CHARS = Number(process.env.METADATA_EXTRACTION_MAX_CHARS ?? 8_000);

// ── Retry configuration (per-provider with common fallback) ─────────

/** Common retry defaults — per-provider env vars fall back to these. */
const DEFAULT_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 3);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.LLM_RETRY_DELAY_MS ?? 500);
const DEFAULT_RETRY_MAX_DELAY_MS = Number(process.env.LLM_RETRY_MAX_DELAY_MS ?? 10_000);

/** LLM chat/scoring retry config. */
export const LLM_MAX_RETRIES = DEFAULT_MAX_RETRIES;
export const LLM_RETRY_DELAY_MS = DEFAULT_RETRY_DELAY_MS;
export const LLM_RETRY_MAX_DELAY_MS = DEFAULT_RETRY_MAX_DELAY_MS;

/** Embedding retry config — falls back to LLM_* values. */
export const EMBEDDING_MAX_RETRIES = Number(process.env.EMBEDDING_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
export const EMBEDDING_RETRY_DELAY_MS = Number(process.env.EMBEDDING_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
export const EMBEDDING_RETRY_MAX_DELAY_MS = Number(
  process.env.EMBEDDING_RETRY_MAX_DELAY_MS ?? DEFAULT_RETRY_MAX_DELAY_MS,
);

/** Reranker retry config — falls back to LLM_* values. */
export const RERANKER_MAX_RETRIES = Number(process.env.RERANKER_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
export const RERANKER_RETRY_DELAY_MS = Number(process.env.RERANKER_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
export const RERANKER_RETRY_MAX_DELAY_MS = Number(
  process.env.RERANKER_RETRY_MAX_DELAY_MS ?? DEFAULT_RETRY_MAX_DELAY_MS,
);

// ── Bedrock provider (singleton, lazily initialized) ─────────────────

let _bedrockProvider: ReturnType<typeof createAmazonBedrock> | undefined;

/** Returns a shared Bedrock provider instance using the AWS credential chain. */
function getBedrockProvider() {
  if (!_bedrockProvider) {
    _bedrockProvider = createAmazonBedrock({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentialProvider: fromNodeProviderChain(),
      fetch: createInstrumentedFetch({
        maxRetries: LLM_MAX_RETRIES,
        retryDelayMs: LLM_RETRY_DELAY_MS,
        retryMaxDelayMs: LLM_RETRY_MAX_DELAY_MS,
      }),
    });
  }
  return _bedrockProvider;
}

/**
 * Creates a chat model.
 *
 * - **Gateway mode** (`LLM_BASE_URL` set): uses the OpenAI-compatible gateway (e.g. Bifrost)
 * - **Direct mode** (`LLM_BASE_URL` unset): uses the native AWS Bedrock SDK with credential chain
 */
export function createChatModel(modelId?: string) {
  const resolvedId = modelId ?? process.env.LLM_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;

  if (isGatewayMode()) {
    const provider = createOpenAICompatible({
      name: 'llm',
      baseURL: process.env.LLM_BASE_URL!,
      apiKey: process.env.LLM_API_KEY ?? '',
      supportsStructuredOutputs: true,
      includeUsage: true,
      fetch: createInstrumentedFetch({
        maxRetries: LLM_MAX_RETRIES,
        retryDelayMs: LLM_RETRY_DELAY_MS,
        retryMaxDelayMs: LLM_RETRY_MAX_DELAY_MS,
      }),
    });
    return provider(resolvedId);
  }

  return getBedrockProvider()(resolvedId);
}

/**
 * Creates a lightweight chat model for auxiliary tasks (e.g. title generation).
 * Uses `LLM_TITLE_MODEL` if set, otherwise falls back to the default chat model.
 */
export function createTitleModel() {
  return createChatModel(process.env.LLM_TITLE_MODEL);
}

/**
 * Creates an embedding model.
 *
 * - **Gateway mode** (`EMBEDDING_BASE_URL` set): uses the OpenAI-compatible endpoint
 * - **Direct mode** (`EMBEDDING_BASE_URL` unset): uses the native AWS Bedrock SDK
 */
export function createEmbeddingModel(modelId?: string) {
  const resolvedId = modelId ?? process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  if (process.env.EMBEDDING_BASE_URL) {
    const provider = createOpenAICompatible({
      name: 'embedding',
      baseURL: process.env.EMBEDDING_BASE_URL,
      apiKey: process.env.EMBEDDING_API_KEY ?? '',
      includeUsage: true,
      fetch: createInstrumentedFetch({
        maxRetries: EMBEDDING_MAX_RETRIES,
        retryDelayMs: EMBEDDING_RETRY_DELAY_MS,
        retryMaxDelayMs: EMBEDDING_RETRY_MAX_DELAY_MS,
      }),
    });
    return provider.textEmbeddingModel(resolvedId);
  }

  return getBedrockProvider().embedding(resolvedId);
}

/** Per-request timeout for the reranker endpoint. Default: 15,000ms. */
export const RERANKER_TIMEOUT_MS = Number(process.env.RERANKER_TIMEOUT_MS ?? 15_000);

/**
 * Creates a reranker scorer.
 *
 * - **Gateway mode** (`RERANKER_BASE_URL` set): uses the Cohere-compatible HTTP endpoint via gateway
 * - **Direct mode** (`RERANKER_BASE_URL` unset): uses the native AWS Bedrock Rerank API
 */
export function createRerankerScorer() {
  if (process.env.RERANKER_BASE_URL) {
    return new RerankerScorer(
      process.env.RERANKER_BASE_URL,
      process.env.RERANKER_API_KEY ?? process.env.LLM_API_KEY ?? '',
      process.env.RERANKER_MODEL ?? '',
      RERANKER_TIMEOUT_MS,
    );
  }

  return new BedrockRerankerScorer(process.env.RERANKER_MODEL ?? '', process.env.AWS_REGION ?? 'us-east-1');
}

export { BedrockRerankerScorer } from './bedrock-reranker-scorer';
export { RerankerScorer } from './reranker-scorer';

/**
 * Creates a chat model for metadata extraction during ingestion (title, keywords).
 * Uses `LLM_METADATA_EXTRACTION_MODEL` if set, otherwise falls back to the default chat model.
 * Point this at a cheap/fast model to control ingestion cost.
 */
export function createMetadataExtractionModel() {
  return createChatModel(process.env.LLM_METADATA_EXTRACTION_MODEL);
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
