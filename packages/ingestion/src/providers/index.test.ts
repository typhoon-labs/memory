import { describe, expect, it } from 'vitest';
import { getProvider } from './index';

describe('getProvider', () => {
  it('returns an S3Provider for sourceType "s3"', () => {
    const provider = getProvider('s3');
    expect(provider).toBeDefined();
    expect(typeof provider.download).toBe('function');
    expect(typeof provider.listObjects).toBe('function');
  });

  it('throws for unknown source type', () => {
    expect(() => getProvider('gcs')).toThrow('No provider for source type: gcs');
  });
});
