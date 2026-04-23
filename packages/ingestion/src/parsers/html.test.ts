import { describe, expect, it } from 'vitest';
import { parseHtml } from './html';

// No external network calls — turndown operates on pure strings, no mocking needed.

describe('parseHtml', () => {
  it('returns ParseResult with markdown format', async () => {
    const buffer = Buffer.from('<p>Hello world</p>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('format', 'markdown');
    expect(result).toHaveProperty('metadata');
  });

  it('converts basic paragraph HTML to plain text', async () => {
    const buffer = Buffer.from('<p>Hello world</p>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toBe('Hello world');
    expect(result.text).not.toContain('<p>');
  });

  it('converts headings to ATX markdown', async () => {
    const buffer = Buffer.from('<h1>Title</h1><h2>Subtitle</h2>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('# Title');
    expect(result.text).toContain('## Subtitle');
  });

  it('converts bold and italic to markdown syntax', async () => {
    const buffer = Buffer.from('<p><strong>Bold</strong> and <em>italic</em></p>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('**Bold**');
    expect(result.text).toContain('_italic_');
  });

  it('converts anchor tags to markdown links', async () => {
    const buffer = Buffer.from('<a href="https://example.com">Example</a>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('[Example](https://example.com)');
  });

  it('does not crash on input containing <script> tags', async () => {
    // Turndown converts script text to plain text rather than stripping it —
    // the parser does not add a script-stripping rule, so we only assert it
    // does not throw and that the surrounding visible content is preserved.
    const buffer = Buffer.from('<p>Visible</p><script>alert("xss")</script>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).not.toContain('<script>');
    expect(result.text).toContain('Visible');
  });

  it('does not crash on input containing <style> tags', async () => {
    // Same as above — the parser does not strip style content, but it must
    // not output raw HTML tags or throw.
    const buffer = Buffer.from('<style>body { color: red; }</style><p>Visible</p>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).not.toContain('<style>');
    expect(result.text).toContain('Visible');
  });

  it('converts unordered lists to markdown bullet lists', async () => {
    const buffer = Buffer.from('<ul><li>Item one</li><li>Item two</li></ul>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('Item one');
    expect(result.text).toContain('Item two');
    // turndown with bulletListMarker '-' uses dashes
    expect(result.text).toMatch(/^-\s/m);
  });

  it('converts ordered lists to numbered markdown lists', async () => {
    const buffer = Buffer.from('<ol><li>First</li><li>Second</li></ol>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('1.  First');
    expect(result.text).toContain('2.  Second');
  });

  it('converts code blocks to fenced markdown code', async () => {
    const buffer = Buffer.from('<pre><code>const x = 1;</code></pre>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.text).toContain('```');
    expect(result.text).toContain('const x = 1;');
  });

  it('handles tables and includes their content', async () => {
    const buffer = Buffer.from(
      '<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td>Alice</td><td>30</td></tr></tbody></table>',
    );
    const result = await parseHtml(buffer, 'table.html');

    expect(result.text).toContain('Name');
    expect(result.text).toContain('Age');
    expect(result.text).toContain('Alice');
    expect(result.text).toContain('30');
    // GFM tables use | separators
    expect(result.text).toContain('|');
  });

  it('returns empty metadata object', async () => {
    const buffer = Buffer.from('<p>Text</p>');
    const result = await parseHtml(buffer, 'page.html');

    expect(result.metadata).toEqual({});
  });

  it('handles empty buffer gracefully', async () => {
    const buffer = Buffer.from('');
    const result = await parseHtml(buffer, 'empty.html');

    expect(result.text).toBe('');
    expect(result.format).toBe('markdown');
  });

  it('does not crash on malformed HTML', async () => {
    const buffer = Buffer.from('<p>Unclosed <b>tag with <em>nesting');
    await expect(parseHtml(buffer, 'bad.html')).resolves.not.toThrow();
  });

  it('preserves text content from malformed HTML', async () => {
    const buffer = Buffer.from('<p>Unclosed <b>bold text</p>');
    const result = await parseHtml(buffer, 'bad.html');

    expect(result.text).toContain('bold text');
  });

  it('handles HTML with only whitespace', async () => {
    const buffer = Buffer.from('   \n\t  ');
    const result = await parseHtml(buffer, 'whitespace.html');

    expect(typeof result.text).toBe('string');
    expect(result.format).toBe('markdown');
  });

  it('reads the buffer as utf-8', async () => {
    const content = '<p>Héllo wörld</p>';
    const buffer = Buffer.from(content, 'utf-8');
    const result = await parseHtml(buffer, 'unicode.html');

    expect(result.text).toContain('Héllo wörld');
  });

  it('accepts .htm filename without error', async () => {
    const buffer = Buffer.from('<p>Content</p>');
    await expect(parseHtml(buffer, 'page.htm')).resolves.not.toThrow();
  });
});
