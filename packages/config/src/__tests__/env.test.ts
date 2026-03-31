import { describe, expect, it } from 'vitest';
import { validateEnv } from '../env.js';

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
});
