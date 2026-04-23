import { describe, expect, it } from 'vitest';
import { isScoringEnabled, validateEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgresql://typhoon:typhoon@localhost:5432/typhoon',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  LLM_BASE_URL: 'http://localhost:8787/v1',
  LLM_API_KEY: 'changeme',
  EMBEDDING_BASE_URL: 'http://localhost:11434/v1',
  AUTH_SECRET: 'test-secret',
  AUTH_URL: 'http://localhost:5172',
};

describe('validateEnv', () => {
  it('validates a complete valid environment', () => {
    const result = validateEnv(validEnv);
    expect(result.DATABASE_URL).toBe('postgresql://typhoon:typhoon@localhost:5432/typhoon');
    expect(result.PORT).toBe(5172);
    expect(result.S3_BUCKET).toBe('typhoon-documents');
    expect(result.LLM_CHAT_MODEL).toBe('anthropic.claude-sonnet-4-6-v1:0');
  });

  it('throws on missing required fields', () => {
    expect(() => validateEnv({})).toThrow('Environment validation failed');
  });

  it('applies default values for optional fields', () => {
    const result = validateEnv(validEnv);
    expect(result.S3_REGION).toBe('us-east-1');
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

  it('rejects empty S3_ACCESS_KEY', () => {
    expect(() => validateEnv({ ...validEnv, S3_ACCESS_KEY: '' })).toThrow('Environment validation failed');
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

  it('applies EMBEDDING_MAX_CHUNK_CHARS default', () => {
    const result = validateEnv(validEnv);
    expect(result.EMBEDDING_MAX_CHUNK_CHARS).toBe(24_000);
  });

  it('accepts custom EMBEDDING_MAX_CHUNK_CHARS', () => {
    const result = validateEnv({ ...validEnv, EMBEDDING_MAX_CHUNK_CHARS: '32000' });
    expect(result.EMBEDDING_MAX_CHUNK_CHARS).toBe(32_000);
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
    try {
      validateEnv({});
    } catch (err) {
      expect((err as Error).message).toContain('DATABASE_URL');
      expect((err as Error).message).toContain('REDIS_URL');
    }
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
      LLM_SCORING_MODEL: 'anthropic.claude-sonnet-4-6-v1:0',
      SCORING_SAMPLE_RATE: '0.5',
      SCORING_CONCURRENCY: '3',
      SPAN_RETENTION_DAYS: '30',
      SCORE_RETENTION_DAYS: '365',
    });
    expect(result.SCORING_ENABLED).toBe('false');
    expect(result.LLM_SCORING_MODEL).toBe('anthropic.claude-sonnet-4-6-v1:0');
    expect(result.SCORING_SAMPLE_RATE).toBe(0.5);
    expect(result.SCORING_CONCURRENCY).toBe(3);
    expect(result.SPAN_RETENTION_DAYS).toBe(30);
    expect(result.SCORE_RETENTION_DAYS).toBe(365);
  });

  it('rejects SCORING_SAMPLE_RATE outside [0, 1]', () => {
    expect(() => validateEnv({ ...validEnv, SCORING_SAMPLE_RATE: '1.5' })).toThrow('Environment validation failed');
    expect(() => validateEnv({ ...validEnv, SCORING_SAMPLE_RATE: '-0.1' })).toThrow('Environment validation failed');
  });

  it('rejects SCORING_CONCURRENCY below 1', () => {
    expect(() => validateEnv({ ...validEnv, SCORING_CONCURRENCY: '0' })).toThrow('Environment validation failed');
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
