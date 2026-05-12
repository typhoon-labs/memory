import { describe, expect, it } from 'vitest';
import { validateSearchExperimentCompare, validateSearchReviews, validateSearchTraceDetail } from './route-tree';

describe('validateSearchReviews', () => {
  it('returns defaults for empty input', () => {
    const result = validateSearchReviews({});
    expect(result).toEqual({
      sortBy: 'newest',
      annotationStatus: 'all',
      feedbackStatus: 'all',
      search: undefined,
    });
  });

  it('parses valid sortBy values', () => {
    expect(validateSearchReviews({ sortBy: 'newest' }).sortBy).toBe('newest');
    expect(validateSearchReviews({ sortBy: 'unscored' }).sortBy).toBe('unscored');
  });

  it('rejects invalid sortBy', () => {
    expect(validateSearchReviews({ sortBy: 'invalid' }).sortBy).toBe('newest');
  });

  it('parses valid annotationStatus', () => {
    expect(validateSearchReviews({ annotationStatus: 'annotated' }).annotationStatus).toBe('annotated');
    expect(validateSearchReviews({ annotationStatus: 'unannotated' }).annotationStatus).toBe('unannotated');
  });

  it('rejects invalid annotationStatus', () => {
    expect(validateSearchReviews({ annotationStatus: 'bogus' }).annotationStatus).toBe('all');
  });

  it('parses valid feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'has-feedback' }).feedbackStatus).toBe('has-feedback');
    expect(validateSearchReviews({ feedbackStatus: 'has-negative' }).feedbackStatus).toBe('has-negative');
    expect(validateSearchReviews({ feedbackStatus: 'no-feedback' }).feedbackStatus).toBe('no-feedback');
  });

  it('rejects invalid feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'nope' }).feedbackStatus).toBe('all');
  });

  it('parses search string', () => {
    expect(validateSearchReviews({ search: 'hello' }).search).toBe('hello');
  });

  it('rejects non-string search', () => {
    expect(validateSearchReviews({ search: 123 }).search).toBeUndefined();
  });
});

describe('validateSearchExperimentCompare', () => {
  it('returns defaults for empty input', () => {
    expect(validateSearchExperimentCompare({})).toEqual({ a: '', b: '', item: undefined });
  });

  it('parses experiment IDs', () => {
    const result = validateSearchExperimentCompare({ a: 'exp-1', b: 'exp-2' });
    expect(result.a).toBe('exp-1');
    expect(result.b).toBe('exp-2');
  });

  it('defaults to empty string for non-string IDs', () => {
    expect(validateSearchExperimentCompare({ a: 123, b: null }).a).toBe('');
    expect(validateSearchExperimentCompare({ a: 123, b: null }).b).toBe('');
  });

  it('parses numeric item from string', () => {
    expect(validateSearchExperimentCompare({ item: '7' }).item).toBe(7);
  });

  it('parses item "0"', () => {
    expect(validateSearchExperimentCompare({ item: '0' }).item).toBe(0);
  });

  it('accepts item as actual number (from programmatic navigate)', () => {
    expect(validateSearchExperimentCompare({ item: 3 }).item).toBe(3);
  });

  it('rejects non-numeric item', () => {
    expect(validateSearchExperimentCompare({ item: 'abc' }).item).toBeUndefined();
  });
});

describe('validateSearchTraceDetail', () => {
  it('returns undefined span for empty input', () => {
    expect(validateSearchTraceDetail({})).toEqual({ span: undefined });
  });

  it('parses string span ID', () => {
    expect(validateSearchTraceDetail({ span: 'span-abc' }).span).toBe('span-abc');
  });

  it('rejects non-string span', () => {
    expect(validateSearchTraceDetail({ span: 123 }).span).toBeUndefined();
  });
});
