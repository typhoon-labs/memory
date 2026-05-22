import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { asUnrecoverable, isUnrecoverable } from './classify-error';

describe('isUnrecoverable', () => {
  it('returns true for UnrecoverableError instances', () => {
    expect(isUnrecoverable(new UnrecoverableError('boom'))).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isUnrecoverable('string error')).toBe(false);
    expect(isUnrecoverable(42)).toBe(false);
    expect(isUnrecoverable(null)).toBe(false);
    expect(isUnrecoverable(undefined)).toBe(false);
  });

  it('returns false for generic Error', () => {
    expect(isUnrecoverable(new Error('Something went wrong'))).toBe(false);
  });

  describe('message patterns', () => {
    it('matches "Sync target not found"', () => {
      expect(isUnrecoverable(new Error('Sync target not found: abc'))).toBe(true);
    });

    it('matches "No provider for source type"', () => {
      expect(isUnrecoverable(new Error('No provider for source type: s3'))).toBe(true);
    });

    it('matches "No parser for"', () => {
      expect(isUnrecoverable(new Error('No parser for .xyz'))).toBe(true);
    });

    it('matches "Empty response body"', () => {
      expect(isUnrecoverable(new Error('Empty response body for s3://bucket/key'))).toBe(true);
    });
  });

  describe('AWS error codes', () => {
    it('matches via .Code property', () => {
      const err = Object.assign(new Error('not found'), { Code: 'NoSuchKey' });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('matches via .name property', () => {
      const err = new Error('forbidden');
      err.name = 'AccessDenied';
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('matches all known codes', () => {
      for (const code of ['NoSuchKey', 'NoSuchBucket', 'AccessDenied', 'InvalidBucketName', 'Forbidden']) {
        const err = Object.assign(new Error('aws error'), { Code: code });
        expect(isUnrecoverable(err)).toBe(true);
      }
    });
  });

  describe('HTTP status codes', () => {
    it('returns true for 400', () => {
      const err = Object.assign(new Error('bad request'), { statusCode: 400 });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('returns true for 403', () => {
      const err = Object.assign(new Error('forbidden'), { status: 403 });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('returns true for 404', () => {
      const err = Object.assign(new Error('not found'), { statusCode: 404 });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('returns false for 408 (timeout)', () => {
      const err = Object.assign(new Error('timeout'), { statusCode: 408 });
      expect(isUnrecoverable(err)).toBe(false);
    });

    it('returns false for 429 (throttling)', () => {
      const err = Object.assign(new Error('throttled'), { statusCode: 429 });
      expect(isUnrecoverable(err)).toBe(false);
    });

    it('returns false for 500', () => {
      const err = Object.assign(new Error('server error'), { statusCode: 500 });
      expect(isUnrecoverable(err)).toBe(false);
    });

    it('reads from $metadata.httpStatusCode', () => {
      const err = Object.assign(new Error('aws error'), { $metadata: { httpStatusCode: 404 } });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('returns true for 401 (unauthorized)', () => {
      const err = Object.assign(new Error('unauthorized'), { statusCode: 401 });
      expect(isUnrecoverable(err)).toBe(true);
    });

    it('prefers status over $metadata.httpStatusCode', () => {
      const err = Object.assign(new Error('mixed'), { status: 404, $metadata: { httpStatusCode: 500 } });
      // status (404) is checked first, so it's unrecoverable
      expect(isUnrecoverable(err)).toBe(true);
    });
  });
});

describe('asUnrecoverable', () => {
  it('wraps an Error with context', () => {
    const result = asUnrecoverable(new Error('original'), 'processing file');
    expect(result).toBeInstanceOf(UnrecoverableError);
    expect(result.message).toBe('processing file: original');
  });

  it('wraps an Error without context', () => {
    const result = asUnrecoverable(new Error('original'));
    expect(result).toBeInstanceOf(UnrecoverableError);
    expect(result.message).toBe('original');
  });

  it('wraps a non-Error value', () => {
    const result = asUnrecoverable('string error', 'ctx');
    expect(result).toBeInstanceOf(UnrecoverableError);
    expect(result.message).toBe('ctx: string error');
  });
});
