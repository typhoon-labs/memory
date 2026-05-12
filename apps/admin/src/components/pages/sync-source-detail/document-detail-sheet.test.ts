import { describe, expect, it } from 'vitest';
import { coerceMetadataValue } from './document-detail-sheet';

describe('coerceMetadataValue', () => {
  it('passes through strings for undefined field def', () => {
    expect(coerceMetadataValue('hello', undefined)).toBe('hello');
  });

  it('passes through strings for string field type', () => {
    expect(coerceMetadataValue('hello', { type: 'string' })).toBe('hello');
  });

  it('coerces valid numbers', () => {
    expect(coerceMetadataValue('42', { type: 'number' })).toBe(42);
    expect(coerceMetadataValue('3.14', { type: 'number' })).toBe(3.14);
    expect(coerceMetadataValue('0', { type: 'number' })).toBe(0);
    expect(coerceMetadataValue('-10', { type: 'number' })).toBe(-10);
  });

  it('returns original string for invalid numbers', () => {
    expect(coerceMetadataValue('abc', { type: 'number' })).toBe('abc');
    expect(coerceMetadataValue('', { type: 'number' })).toBe(0); // Number('') === 0
  });

  it('coerces booleans', () => {
    expect(coerceMetadataValue('true', { type: 'boolean' })).toBe(true);
    expect(coerceMetadataValue('false', { type: 'boolean' })).toBe(false);
    expect(coerceMetadataValue('anything', { type: 'boolean' })).toBe(false);
  });

  it('coerces string arrays from comma-separated values', () => {
    expect(coerceMetadataValue('US, UK, CA', { type: 'string[]' })).toEqual(['US', 'UK', 'CA']);
    expect(coerceMetadataValue('single', { type: 'string[]' })).toEqual(['single']);
    expect(coerceMetadataValue('', { type: 'string[]' })).toEqual([]);
  });

  it('filters empty entries from string arrays', () => {
    expect(coerceMetadataValue('a,,b', { type: 'string[]' })).toEqual(['a', 'b']);
    expect(coerceMetadataValue(', , ,', { type: 'string[]' })).toEqual([]);
  });
});
