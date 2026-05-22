import { describe, expect, it } from 'vitest';

import { isRedisCluster, isScoringEnabled, validateEnv } from './env';

/** Minimal valid env — direct Bedrock mode (no gateway URLs). */
const validEnv = {
  DATABASE_URL: 'postgresql://typhoon:typhoon@localhost:5432/typhoon',
  REDIS_URL: 'redis://localhost:6379',
  AUTH_SECRET: 'test-secret',
  AUTH_URL: 'http://localhost:5172',
};

/** Valid env with gateway URLs — Bifrost/dev mode. */
const validGatewayEnv = {
  ...validEnv,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  LLM_BASE_URL: 'http://localhost:8787/v1',
  LLM_API_KEY: 'changeme',
  RERANKER_BASE_URL: 'http://localhost:8787/v1',
  RERANKER_MODEL: 'bedrock/amazon.rerank-v1:0',
  EMBEDDING_BASE_URL: 'http://localhost:11434/v1',
};

describe('validateEnv', () => {
  it('validates a minimal valid environment (direct Bedrock mode)', () => {
    const result = validateEnv(validEnv);
    expect(result.DATABASE_URL).toBe('postgresql://typhoon:typhoon@localhost:5432/typhoon');
    expect(result.PORT).toBe(5172);
    expect(result.S3_BUCKET).toBe('typhoon-documents');
    expect(result.LLM_CHAT_MODEL).toBe('anthropic.claude-sonnet-4-6');
    expect(result.LLM_BASE_URL).toBeUndefined();
    expect(result.LLM_API_KEY).toBeUndefined();
    expect(result.EMBEDDING_BASE_URL).toBeUndefined();
    expect(result.RERANKER_BASE_URL).toBeUndefined();
    expect(result.S3_ENDPOINT).toBeUndefined();
    expect(result.S3_ACCESS_KEY).toBeUndefined();
    expect(result.S3_SECRET_KEY).toBeUndefined();
  });

  it('validates a complete gateway environment (Bifrost mode)', () => {
    const result = validateEnv(validGatewayEnv);
    expect(result.LLM_BASE_URL).toBe('http://localhost:8787/v1');
    expect(result.LLM_API_KEY).toBe('changeme');
    expect(result.EMBEDDING_BASE_URL).toBe('http://localhost:11434/v1');
    expect(result.RERANKER_BASE_URL).toBe('http://localhost:8787/v1');
    expect(result.S3_ACCESS_KEY).toBe('minioadmin');
    expect(result.S3_SECRET_KEY).toBe('minioadmin');
  });

  it('throws on missing required fields', () => {
    expect(() => validateEnv({})).toThrow('Environment validation failed');
  });

  it('applies default values for optional fields', () => {
    const result = validateEnv(validEnv);
    expect(result.AWS_REGION).toBe('us-east-1');
    expect(result.S3_REGION).toBe('us-east-1');
    expect(result.S3_FORCE_PATH_STYLE).toBe('true');
    expect(result.HOST).toBe('0.0.0.0');
    expect(result.EMBEDDING_MODEL).toBe('amazon.titan-embed-text-v2:0');
    expect(result.EMBEDDING_DIMENSION).toBe(1024);
  });

  it('accepts custom port', () => {
    const result = validateEnv({ ...validEnv, PORT: '8080' });
    expect(result.PORT).toBe(8080);
  });

  it('validates DATABASE_URL is a valid URL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow('Environment validation failed');
  });

  it('rejects empty S3_ACCESS_KEY when explicitly provided', () => {
    expect(() => validateEnv({ ...validEnv, S3_ACCESS_KEY: '' })).toThrow('Environment validation failed');
  });

  it('accepts S3_FORCE_PATH_STYLE=false for production S3', () => {
    const result = validateEnv({ ...validEnv, S3_FORCE_PATH_STYLE: 'false' });
    expect(result.S3_FORCE_PATH_STYLE).toBe('false');
  });

  it('accepts OIDC config when all three fields are present', () => {
    const result = validateEnv({
      ...validEnv,
      OIDC_ISSUER_URL: 'http://localhost:5556/dex',
      OIDC_CLIENT_ID: 'typhoon',
      OIDC_CLIENT_SECRET: 'secret',
    });
    expect(result.OIDC_ISSUER_URL).toBe('http://localhost:5556/dex');
    expect(result.OIDC_CLIENT_ID).toBe('typhoon');
    expect(result.OIDC_CLIENT_SECRET).toBe('secret');
  });

  it('accepts partial OIDC config (all fields are optional)', () => {
    const result = validateEnv(validEnv);
    expect(result.OIDC_ISSUER_URL).toBeUndefined();
    expect(result.OIDC_CLIENT_ID).toBeUndefined();
  });

  it('coerces EMBEDDING_DIMENSION to integer', () => {
    const result = validateEnv({ ...validEnv, EMBEDDING_DIMENSION: '768' });
    expect(result.EMBEDDING_DIMENSION).toBe(768);
  });

  it('accepts valid LOG_LEVEL enum values', () => {
    for (const level of ['debug', 'info', 'warn', 'error', 'silent'] as const) {
      const result = validateEnv({ ...validEnv, LOG_LEVEL: level });
      expect(result.LOG_LEVEL).toBe(level);
    }
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => validateEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow('Environment validation failed');
  });

  it('error message includes field names', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
    expect(() => validateEnv({})).toThrow('REDIS_URL');
  });

  it('applies scoring defaults', () => {
    const result = validateEnv(validEnv);
    expect(result.SCORING_ENABLED).toBe('true');
    expect(result.LLM_SCORING_MODEL).toBe('claude-haiku-4-5-20251001');
    expect(result.SCORING_SAMPLE_RATE).toBe(1.0);
    expect(result.SCORING_CONCURRENCY).toBe(5);
    expect(result.SPAN_RETENTION_DAYS).toBe(90);
    expect(result.SCORE_RETENTION_DAYS).toBe(0);
  });

  it('accepts custom scoring configuration', () => {
    const result = validateEnv({
      ...validEnv,
      SCORING_ENABLED: 'false',
      LLM_SCORING_MODEL: 'anthropic.claude-sonnet-4-6',
      LLM_SCORING_MODEL_OPTIONS: 'model-a,model-b,model-c',
      SCORING_SAMPLE_RATE: '0.5',
      SCORING_CONCURRENCY: '3',
      SPAN_RETENTION_DAYS: '30',
      SCORE_RETENTION_DAYS: '365',
    });
    expect(result.SCORING_ENABLED).toBe('false');
    expect(result.LLM_SCORING_MODEL).toBe('anthropic.claude-sonnet-4-6');
    expect(result.LLM_SCORING_MODEL_OPTIONS).toBe('model-a,model-b,model-c');
    expect(result.SCORING_SAMPLE_RATE).toBe(0.5);
    expect(result.SCORING_CONCURRENCY).toBe(3);
    expect(result.SPAN_RETENTION_DAYS).toBe(30);
    expect(result.SCORE_RETENTION_DAYS).toBe(365);
  });

  it('LLM_SCORING_MODEL_OPTIONS defaults to undefined when not set', () => {
    const result = validateEnv(validEnv);
    expect(result.LLM_SCORING_MODEL_OPTIONS).toBeUndefined();
  });

  it('rejects SCORING_SAMPLE_RATE outside [0, 1]', () => {
    expect(() => validateEnv({ ...validEnv, SCORING_SAMPLE_RATE: '1.5' })).toThrow('Environment validation failed');
    expect(() => validateEnv({ ...validEnv, SCORING_SAMPLE_RATE: '-0.1' })).toThrow('Environment validation failed');
  });

  it('rejects SCORING_CONCURRENCY below 1', () => {
    expect(() => validateEnv({ ...validEnv, SCORING_CONCURRENCY: '0' })).toThrow('Environment validation failed');
  });

  // ── RAG tuning ──

  it('applies RAG tuning defaults', () => {
    const result = validateEnv(validEnv);
    expect(result.RAG_RERANK_WEIGHT_SEMANTIC).toBe(1.0);
    expect(result.RAG_RERANK_WEIGHT_VECTOR).toBe(0);
    expect(result.RAG_RERANK_WEIGHT_POSITION).toBe(0);
    expect(result.RAG_RERANK_MIN_SCORE).toBe(0.1);
    expect(result.RAG_VECTOR_MIN_SCORE).toBe(0.6);
    expect(result.RAG_VECTOR_MIN_SCORE_AGENT).toBe(0.5);
    expect(result.RAG_GRAPH_THRESHOLD).toBe(0.7);
    expect(result.RAG_KNOWLEDGE_MAX_RESULTS).toBe(10);
    expect(result.RAG_HYBRID_RRF_K).toBe(60);
    expect(result.RAG_HYBRID_VECTOR_WEIGHT).toBe(0.7);
    expect(result.RAG_HYBRID_FTS_WEIGHT).toBe(0.3);
    expect(result.RAG_HYBRID_CANDIDATE_MULTIPLIER).toBe(5);
    expect(result.RAG_RERANK_CANDIDATES).toBe(100);
    expect(result.RAG_RERANK_CANDIDATES_EXPANDED).toBe(200);
  });

  it('accepts custom RAG tuning values', () => {
    const result = validateEnv({
      ...validEnv,
      RAG_RERANK_WEIGHT_SEMANTIC: '0.4',
      RAG_RERANK_WEIGHT_VECTOR: '0.4',
      RAG_RERANK_WEIGHT_POSITION: '0.2',
      RAG_RERANK_MIN_SCORE: '0.05',
      RAG_HYBRID_RRF_K: '30',
    });
    expect(result.RAG_RERANK_WEIGHT_SEMANTIC).toBe(0.4);
    expect(result.RAG_RERANK_WEIGHT_VECTOR).toBe(0.4);
    expect(result.RAG_RERANK_MIN_SCORE).toBe(0.05);
    expect(result.RAG_HYBRID_RRF_K).toBe(30);
  });

  it('rejects reranker weights that do not sum to 1', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        RAG_RERANK_WEIGHT_SEMANTIC: '0.6',
        RAG_RERANK_WEIGHT_VECTOR: '0.6',
        RAG_RERANK_WEIGHT_POSITION: '0.2',
      }),
    ).toThrow('sum to 1.0');
  });
});

describe('isScoringEnabled', () => {
  it('returns true when SCORING_ENABLED is undefined', () => {
    expect(isScoringEnabled({})).toBe(true);
  });

  it('returns true when SCORING_ENABLED is "true"', () => {
    expect(isScoringEnabled({ SCORING_ENABLED: 'true' })).toBe(true);
  });

  it('returns true when SCORING_ENABLED is "1"', () => {
    expect(isScoringEnabled({ SCORING_ENABLED: '1' })).toBe(true);
  });

  it('returns false when SCORING_ENABLED is "false"', () => {
    expect(isScoringEnabled({ SCORING_ENABLED: 'false' })).toBe(false);
  });

  it('returns false when SCORING_ENABLED is "0"', () => {
    expect(isScoringEnabled({ SCORING_ENABLED: '0' })).toBe(false);
  });
});

describe('isRedisCluster', () => {
  it('returns false when REDIS_CLUSTER is undefined', () => {
    expect(isRedisCluster({})).toBe(false);
  });

  it('returns false when REDIS_CLUSTER is "false"', () => {
    expect(isRedisCluster({ REDIS_CLUSTER: 'false' })).toBe(false);
  });

  it('returns false when REDIS_CLUSTER is "0"', () => {
    expect(isRedisCluster({ REDIS_CLUSTER: '0' })).toBe(false);
  });

  it('returns true when REDIS_CLUSTER is "true"', () => {
    expect(isRedisCluster({ REDIS_CLUSTER: 'true' })).toBe(true);
  });

  it('returns true when REDIS_CLUSTER is "1"', () => {
    expect(isRedisCluster({ REDIS_CLUSTER: '1' })).toBe(true);
  });
});

describe('validateEnv redis fields', () => {
  it('applies REDIS_KEY_PREFIX default', () => {
    const result = validateEnv(validEnv);
    expect(result.REDIS_KEY_PREFIX).toBe('typhoon');
  });

  it('accepts custom REDIS_KEY_PREFIX', () => {
    const result = validateEnv({ ...validEnv, REDIS_KEY_PREFIX: 'myapp' });
    expect(result.REDIS_KEY_PREFIX).toBe('myapp');
  });

  it('applies REDIS_CLUSTER default', () => {
    const result = validateEnv(validEnv);
    expect(result.REDIS_CLUSTER).toBe('false');
  });

  it('accepts REDIS_CLUSTER=true', () => {
    const result = validateEnv({ ...validEnv, REDIS_CLUSTER: 'true' });
    expect(result.REDIS_CLUSTER).toBe('true');
  });
});
