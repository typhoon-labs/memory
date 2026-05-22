import { describe, expect, it } from 'vitest';

import { getMDocFormat, getParser, needsCustomParser } from './registry';

describe('needsCustomParser', () => {
  it('returns true for supported binary formats', () => {
    expect(needsCustomParser('doc.pdf')).toBe(true);
    expect(needsCustomParser('doc.docx')).toBe(true);
    expect(needsCustomParser('data.xlsx')).toBe(true);
    expect(needsCustomParser('page.html')).toBe(true);
    expect(needsCustomParser('page.htm')).toBe(true);
  });

  it('returns false for text-based formats', () => {
    expect(needsCustomParser('readme.md')).toBe(false);
    expect(needsCustomParser('notes.txt')).toBe(false);
    expect(needsCustomParser('data.json')).toBe(false);
    expect(needsCustomParser('data.csv')).toBe(false);
    expect(needsCustomParser('readme.mdx')).toBe(false);
  });

  it('handles case-insensitive extensions', () => {
    expect(needsCustomParser('FILE.PDF')).toBe(true);
    expect(needsCustomParser('Doc.DOCX')).toBe(true);
    expect(needsCustomParser('Page.Html')).toBe(true);
  });

  it('handles multi-dot filenames', () => {
    expect(needsCustomParser('archive.2024.pdf')).toBe(true);
    expect(needsCustomParser('report.v2.docx')).toBe(true);
  });
});

describe('getParser', () => {
  it('returns a function for supported extensions', () => {
    expect(typeof getParser('doc.pdf')).toBe('function');
    expect(typeof getParser('doc.docx')).toBe('function');
    expect(typeof getParser('data.xlsx')).toBe('function');
    expect(typeof getParser('page.html')).toBe('function');
    expect(typeof getParser('page.htm')).toBe('function');
  });

  it('returns undefined for unsupported extensions', () => {
    expect(getParser('readme.md')).toBeUndefined();
    expect(getParser('notes.txt')).toBeUndefined();
    expect(getParser('data.json')).toBeUndefined();
  });

  it('handles case-insensitive extensions', () => {
    expect(typeof getParser('FILE.PDF')).toBe('function');
  });

  it('handles multi-dot filenames', () => {
    expect(typeof getParser('archive.2024.pdf')).toBe('function');
  });
});

describe('getMDocFormat', () => {
  it('returns markdown for .md and .mdx', () => {
    expect(getMDocFormat('readme.md')).toBe('markdown');
    expect(getMDocFormat('readme.mdx')).toBe('markdown');
  });

  it('returns json for .json', () => {
    expect(getMDocFormat('data.json')).toBe('json');
  });

  it('returns text for everything else', () => {
    expect(getMDocFormat('notes.txt')).toBe('text');
    expect(getMDocFormat('data.csv')).toBe('text');
    expect(getMDocFormat('doc.pdf')).toBe('text');
  });
});
