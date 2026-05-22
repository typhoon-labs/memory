import { describe, expect, it } from 'vitest';

import { StageTimeoutError, withTimeout } from './with-timeout';

describe('StageTimeoutError', () => {
  it('has correct name, stage, and ms properties', () => {
    const err = new StageTimeoutError('embed', 5000);
    expect(err.name).toBe('StageTimeoutError');
    expect(err.stage).toBe('embed');
    expect(err.ms).toBe(5000);
    expect(err.message).toBe('Stage "embed" exceeded 5000ms timeout');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test');
    expect(result).toBe('ok');
  });

  it('throws StageTimeoutError when promise exceeds timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500));
    await expect(withTimeout(slow, 10, 'parse')).rejects.toThrow(StageTimeoutError);
    await expect(withTimeout(slow, 10, 'parse')).rejects.toThrow('Stage "parse" exceeded 10ms timeout');
  });

  it('propagates original error when promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('original failure'));
    await expect(withTimeout(failing, 5000, 'test')).rejects.toThrow('original failure');
  });

  it('returns correct value type', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'test');
    expect(result).toBe(42);
  });
});
