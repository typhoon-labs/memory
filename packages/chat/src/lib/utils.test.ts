import { describe, expect, it } from 'vitest';
import { cn, stripMarkdown } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('removes falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting Tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });
});

describe('stripMarkdown', () => {
  it('strips bold syntax', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
  });

  it('strips underscore bold syntax', () => {
    expect(stripMarkdown('__bold text__')).toBe('bold text');
  });

  it('strips italic syntax', () => {
    expect(stripMarkdown('*italic text*')).toBe('italic text');
  });

  it('strips underscore italic syntax', () => {
    expect(stripMarkdown('_italic text_')).toBe('italic text');
  });

  it('strips strikethrough syntax', () => {
    expect(stripMarkdown('~~deleted~~')).toBe('deleted');
  });

  it('strips inline code syntax', () => {
    expect(stripMarkdown('`code`')).toBe('code');
  });

  it('strips mixed formatting', () => {
    expect(stripMarkdown('**bold** and *italic* and `code`')).toBe('bold and italic and code');
  });

  it('passes through plain text unchanged', () => {
    expect(stripMarkdown('plain text')).toBe('plain text');
  });

  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('does not strip multiline bold (regex limitation)', () => {
    // .+? doesn't match newlines, so multi-line bold is preserved
    expect(stripMarkdown('**line1\nline2**')).toBe('**line1\nline2**');
  });

  it('handles nested bold and italic', () => {
    expect(stripMarkdown('**bold *italic* bold**')).toBe('bold italic bold');
  });

  it('handles empty markers gracefully', () => {
    // '****' → bold regex matches ** ** → '' inside
    // but .+? requires at least one char, so **** is not matched
    const result = stripMarkdown('****');
    expect(typeof result).toBe('string');
  });
});
