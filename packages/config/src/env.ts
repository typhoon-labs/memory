import { z } from 'zod';

// =============================================================================
// Helpers
// =============================================================================

const optionalUrl = () =>
  z
    .union([z.string(), z.undefined()])
    .transform((val) => (val === '' || val === undefined ? undefined : val))
    .pipe(z.string().url().optional());

const optionalString = (defaultValue: string) => z.string().optional().default(defaultValue);

// =============================================================================
// Database (PostgreSQL + pgvector)
// =============================================================================

export const databaseSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export type DatabaseEnv = z.infer<typeof databaseSchema>;

// =============================================================================
// Redis
// =============================================================================

export const redisSchema = z.object({
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().optional().default('typhoon'),
  REDIS_CLUSTER: z.enum(['true', 'false', '0', '1']).optional().default('false'),
});

export type RedisEnv = z.infer<typeof redisSchema>;

/** Returns `true` if `REDIS_CLUSTER` is explicitly `'true'` or `'1'`. */
export function isRedisCluster(env?: Record<string, string | undefined>): boolean {
  const val = (env ?? process.env).REDIS_CLUSTER;
  return val === 'true' || val === '1';
}

// =============================================================================
// AWS
// =============================================================================

export const awsSchema = z.object({
  AWS_REGION: optionalString('us-east-1'),
});

export type AwsEnv = z.infer<typeof awsSchema>;

// =============================================================================
// S3 / MinIO
// =============================================================================

export const s3Schema = z.object({
  S3_ENDPOINT: optionalUrl(),
  S3_REGION: optionalString('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_BUCKET: optionalString('typhoon-documents'),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false', '0', '1']).optional().default('true'),
});

export type S3Env = z.infer<typeof s3Schema>;

// =============================================================================
// LLM (OpenAI-compatible gateway or direct Bedrock)
// =============================================================================

export const llmSchema = z.object({
  /** Gateway endpoint (e.g. Bifrost). When unset, uses direct Bedrock via AWS SDK. */
  LLM_BASE_URL: optionalUrl(),
  /** Gateway auth key. Only required when LLM_BASE_URL is set. */
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_CHAT_MODEL: optionalString('anthropic.claude-sonnet-4-6'),
  LLM_TITLE_MODEL: z.string().optional(),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  LLM_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(30_000).default(500),
  LLM_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type LlmEnv = z.infer<typeof llmSchema>;

// =============================================================================
// Reranker (Cohere-compatible gateway or direct Bedrock)
// =============================================================================

export const rerankerSchema = z.object({
  /** Rerank gateway endpoint. When unset, uses direct Bedrock Rerank API via AWS SDK. */
  RERANKER_BASE_URL: optionalUrl(),
  /** Reranker model ID or ARN. Required in both gateway and direct modes. */
  RERANKER_MODEL: z.string().min(1).optional(),
  RERANKER_API_KEY: z.string().optional(),
});

export type RerankerEnv = z.infer<typeof rerankerSchema>;

// =============================================================================
// Embeddings (OpenAI-compatible gateway or direct Bedrock)
// =============================================================================

export const embeddingSchema = z.object({
  /** Embedding gateway endpoint. When unset, uses direct Bedrock via AWS SDK. */
  EMBEDDING_BASE_URL: optionalUrl(),
  EMBEDDING_API_KEY: optionalString(''),
  EMBEDDING_MODEL: optionalString('amazon.titan-embed-text-v2:0'),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1024),
  EMBEDDING_MAX_CHARS: z.coerce.number().int().positive().default(2_000),
  EMBEDDING_MAX_TOKENS: z.coerce.number().int().positive().default(8_192),
});

export type EmbeddingEnv = z.infer<typeof embeddingSchema>;

// =============================================================================
// Auth
// =============================================================================

export const authSchema = z.object({
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: optionalUrl().default('http://localhost:5172'),
  TRUSTED_ORIGINS: z.string().optional(),
});

export type AuthEnv = z.infer<typeof authSchema>;

// =============================================================================
// OIDC (optional — Dex for local dev, Okta for production)
// =============================================================================

export const oidcSchema = z.object({
  OIDC_ISSUER_URL: optionalUrl(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
});

export type OidcEnv = z.infer<typeof oidcSchema>;

// =============================================================================
// OpenTelemetry
// =============================================================================

export const otelSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_SERVICE_VERSION: z.string().optional(),
});

export type OtelEnv = z.infer<typeof otelSchema>;

// =============================================================================
// Logging
// =============================================================================

export const logSchema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
});

export type LogEnv = z.infer<typeof logSchema>;

// =============================================================================
// Server
// =============================================================================

export const serverSchema = z.object({
  PORT: z.coerce.number().default(5172),
  HOST: optionalString('0.0.0.0'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

// =============================================================================
// Scoring / Evals
// =============================================================================

export const scoringSchema = z.object({
  SCORING_ENABLED: z.enum(['true', 'false', '0', '1']).optional().default('true'),
  LLM_SCORING_MODEL: optionalString('claude-haiku-4-5-20251001'),
  /** Comma-separated list of model IDs available for scorer selection in the admin UI. */
  LLM_SCORING_MODEL_OPTIONS: z.string().optional(),
  SCORING_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),
  SCORING_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  SPAN_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  SCORE_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
});

export type ScoringEnv = z.infer<typeof scoringSchema>;

// =============================================================================
// RAG Tuning
// =============================================================================

export const ragSchema = z.object({
  RAG_RERANK_WEIGHT_SEMANTIC: z.coerce.number().min(0).max(1).default(1.0),
  RAG_RERANK_WEIGHT_VECTOR: z.coerce.number().min(0).max(1).default(0),
  RAG_RERANK_WEIGHT_POSITION: z.coerce.number().min(0).max(1).default(0),
  RAG_RERANK_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.1),
  RAG_VECTOR_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.6),
  RAG_VECTOR_MIN_SCORE_AGENT: z.coerce.number().min(0).max(1).default(0.5),
  RAG_GRAPH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  RAG_KNOWLEDGE_MAX_RESULTS: z.coerce.number().int().min(1).default(10),
  RAG_HYBRID_RRF_K: z.coerce.number().int().min(1).default(60),
  RAG_HYBRID_VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.7),
  RAG_HYBRID_FTS_WEIGHT: z.coerce.number().min(0).max(1).default(0.3),
  RAG_HYBRID_CANDIDATE_MULTIPLIER: z.coerce.number().int().min(1).default(5),
  RAG_RERANK_CANDIDATES: z.coerce.number().int().min(10).max(500).default(100),
  RAG_RERANK_CANDIDATES_EXPANDED: z.coerce.number().int().min(50).max(1000).default(200),
  /** tsvector weight for tier A (title, critical custom fields). */
  RAG_FTS_WEIGHT_A: z.coerce.number().min(0).default(1.0),
  /** tsvector weight for tier B (section, keywords, high custom fields). */
  RAG_FTS_WEIGHT_B: z.coerce.number().min(0).default(0.6),
  /** tsvector weight for tier C (moderate custom fields — default tier). */
  RAG_FTS_WEIGHT_C: z.coerce.number().min(0).default(0.4),
  /** tsvector weight for tier D (chunk body text, standard custom fields). */
  RAG_FTS_WEIGHT_D: z.coerce.number().min(0).default(0.2),
});

export type RagEnv = z.infer<typeof ragSchema>;

// =============================================================================
// Combined
// =============================================================================

export const envSchema = databaseSchema
  .merge(redisSchema)
  .merge(awsSchema)
  .merge(s3Schema)
  .merge(llmSchema)
  .merge(rerankerSchema)
  .merge(embeddingSchema)
  .merge(authSchema)
  .merge(oidcSchema)
  .merge(otelSchema)
  .merge(logSchema)
  .merge(serverSchema)
  .merge(scoringSchema)
  .merge(ragSchema)
  .refine(
    (env) =>
      Math.abs(env.RAG_RERANK_WEIGHT_SEMANTIC + env.RAG_RERANK_WEIGHT_VECTOR + env.RAG_RERANK_WEIGHT_POSITION - 1.0) <
      0.001,
    { message: 'RAG_RERANK_WEIGHT_SEMANTIC + RAG_RERANK_WEIGHT_VECTOR + RAG_RERANK_WEIGHT_POSITION must sum to 1.0' },
  );

export type Env = z.infer<typeof envSchema>;

/** Returns `true` unless `SCORING_ENABLED` is explicitly `'false'` or `'0'`. */
export function isScoringEnabled(env?: Record<string, string | undefined>): boolean {
  const val = (env ?? process.env).SCORING_ENABLED;
  return val === undefined || (val !== '0' && val !== 'false');
}

/**
 * Parses and validates all environment variables against the combined schema.
 * Throws a descriptive error listing all failing fields on validation failure.
 * Defaults to `process.env` when called without arguments.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
