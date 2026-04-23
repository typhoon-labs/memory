import { beforeEach, describe, expect, it, vi } from 'vitest';

// The parser does `const mammoth = await import('mammoth')` then calls
// `mammoth.convertToHtml(...)` directly — the mock must expose convertToHtml
// at the top level (not under `default`). Use vi.hoisted so the mock fn is
// available inside the vi.mock factory.
const { mockConvertToHtml } = vi.hoisted(() => ({
  mockConvertToHtml: vi.fn(),
}));

vi.mock('mammoth', () => ({
  convertToHtml: mockConvertToHtml,
}));

describe('parseDocx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ParseResult with text and markdown format', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '<p>Hello world</p>', messages: [] });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('fake docx content'), 'test.docx');

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('format', 'markdown');
    expect(result).toHaveProperty('metadata');
  });

  it('converts HTML to markdown — strips tags and preserves content', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '<p>Hello world</p>', messages: [] });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('fake'), 'test.docx');

    expect(result.text).toBe('Hello world');
    expect(result.text).not.toContain('<p>');
    expect(result.text).not.toContain('</p>');
  });

  it('converts headings to ATX markdown syntax', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<h1>Document Title</h1><p>Body text</p>',
      messages: [],
    });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('fake'), 'report.docx');

    expect(result.text).toContain('# Document Title');
    expect(result.text).toContain('Body text');
  });

  it('passes the buffer to mammoth.convertToHtml', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '<p>Content</p>', messages: [] });

    const { parseDocx } = await import('./docx');
    const buffer = Buffer.from('fake docx bytes');
    await parseDocx(buffer, 'file.docx');

    expect(mockConvertToHtml).toHaveBeenCalledWith({ buffer });
  });

  it('accepts any filename as second argument', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '<p>Text</p>', messages: [] });

    const { parseDocx } = await import('./docx');
    await expect(parseDocx(Buffer.from('fake'), 'my-document.docx')).resolves.not.toThrow();
  });

  it('returns empty text when mammoth returns empty HTML', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '', messages: [] });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('empty'), 'empty.docx');

    expect(result.text).toBe('');
    expect(result.format).toBe('markdown');
  });

  it('returns metadata as empty object', async () => {
    mockConvertToHtml.mockResolvedValue({ value: '<p>Content</p>', messages: [] });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('fake'), 'file.docx');

    expect(result.metadata).toEqual({});
  });

  it('converts strong/bold HTML to markdown bold', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<p>This is <strong>bold</strong> text</p>',
      messages: [],
    });

    const { parseDocx } = await import('./docx');
    const result = await parseDocx(Buffer.from('fake'), 'file.docx');

    expect(result.text).toContain('**bold**');
    expect(result.text).not.toContain('<strong>');
  });

  it('throws when mammoth rejects', async () => {
    mockConvertToHtml.mockRejectedValue(new Error('corrupt file'));

    const { parseDocx } = await import('./docx');
    await expect(parseDocx(Buffer.from('corrupt'), 'bad.docx')).rejects.toThrow('corrupt file');
  });
});
