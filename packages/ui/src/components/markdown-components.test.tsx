import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownContent, markdownComponents } from './markdown-components';

afterEach(cleanup);

describe('markdownComponents', () => {
  it('exports all heading levels', () => {
    for (const key of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      expect(markdownComponents[key]).toBeDefined();
    }
  });

  it('exports list components', () => {
    expect(markdownComponents.ul).toBeDefined();
    expect(markdownComponents.ol).toBeDefined();
    expect(markdownComponents.li).toBeDefined();
  });

  it('exports table components', () => {
    expect(markdownComponents.table).toBeDefined();
    expect(markdownComponents.thead).toBeDefined();
    expect(markdownComponents.th).toBeDefined();
    expect(markdownComponents.td).toBeDefined();
  });

  it('exports inline components', () => {
    expect(markdownComponents.p).toBeDefined();
    expect(markdownComponents.a).toBeDefined();
    expect(markdownComponents.code).toBeDefined();
    expect(markdownComponents.pre).toBeDefined();
    expect(markdownComponents.strong).toBeDefined();
    expect(markdownComponents.em).toBeDefined();
    expect(markdownComponents.del).toBeDefined();
    expect(markdownComponents.hr).toBeDefined();
    expect(markdownComponents.blockquote).toBeDefined();
  });
});

describe('MarkdownContent', () => {
  it('renders headings', () => {
    render(<MarkdownContent text="# Heading 1" />);
    expect(screen.getByText('Heading 1')).toBeTruthy();
  });

  it('renders paragraphs', () => {
    render(<MarkdownContent text="Hello world" />);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders lists', () => {
    const { container } = render(<MarkdownContent text={'- Item A\n- Item B'} />);
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
  });

  it('renders tables', () => {
    const { container } = render(<MarkdownContent text={'| A | B |\n|---|---|\n| 1 | 2 |'} />);
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders inline formatting', () => {
    render(<MarkdownContent text="**bold** and *italic*" />);
    expect(screen.getByText('bold')).toBeTruthy();
    expect(screen.getByText('italic')).toBeTruthy();
  });

  it('renders code blocks', () => {
    render(<MarkdownContent text={'`inline code`'} />);
    expect(screen.getByText('inline code')).toBeTruthy();
  });

  it('renders blockquotes', () => {
    render(<MarkdownContent text="> A wise quote" />);
    expect(screen.getByText('A wise quote')).toBeTruthy();
  });

  it('applies className', () => {
    const { container } = render(<MarkdownContent text="test" className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('renders blockquote with correct styling', () => {
    const { container } = render(<MarkdownContent text="> This is a blockquote" />);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeTruthy();
    expect(blockquote?.textContent).toContain('This is a blockquote');
    expect(blockquote?.className).toContain('border-l-[3px]');
    expect(blockquote?.className).toContain('italic');
  });

  it('renders horizontal rules', () => {
    const { container } = render(<MarkdownContent text={'Above\n\n---\n\nBelow'} />);
    const hr = container.querySelector('hr');
    expect(hr).toBeTruthy();
    expect(hr?.className).toContain('border-t');
  });

  it('renders table with thead and tbody', () => {
    const markdown = '| H1 | H2 |\n|---|---|\n| A | B |\n| C | D |';
    const { container } = render(<MarkdownContent text={markdown} />);
    const thead = container.querySelector('thead');
    const th = container.querySelectorAll('th');
    const td = container.querySelectorAll('td');
    expect(thead).toBeTruthy();
    expect(th.length).toBe(2);
    expect(td.length).toBe(4);
    expect(th[0].textContent).toBe('H1');
    expect(th[1].textContent).toBe('H2');
    expect(td[0].textContent).toBe('A');
  });

  it('renders table wrapped in overflow container', () => {
    const markdown = '| X |\n|---|\n| Y |';
    const { container } = render(<MarkdownContent text={markdown} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    // The table component wraps in a div with overflow-x-auto
    const wrapper = table?.parentElement;
    expect(wrapper?.className).toContain('overflow-x-auto');
  });

  it('renders ordered lists', () => {
    const { container } = render(<MarkdownContent text={'1. First\n2. Second\n3. Third'} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    expect(ol?.className).toContain('list-decimal');
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('renders unordered lists with correct styling', () => {
    const { container } = render(<MarkdownContent text={'- Alpha\n- Beta'} />);
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    expect(ul?.className).toContain('list-disc');
  });

  it('renders pre/code blocks for fenced code', () => {
    const md = '```js\nconst x = 1;\n```';
    const { container } = render(<MarkdownContent text={md} />);
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.className).toContain('font-mono');
    const code = pre?.querySelector('code');
    expect(code).toBeTruthy();
  });

  it('renders inline code with background styling', () => {
    const { container } = render(<MarkdownContent text="Use `useState` hook" />);
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe('useState');
    expect(code?.className).toContain('bg-muted');
  });

  it('renders strong with font-semibold', () => {
    const { container } = render(<MarkdownContent text="**bold text**" />);
    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong?.className).toContain('font-semibold');
  });

  it('renders del with muted foreground', () => {
    const { container } = render(<MarkdownContent text="~~deleted~~" />);
    const del = container.querySelector('del');
    expect(del).toBeTruthy();
    expect(del?.className).toContain('text-muted-foreground');
    expect(del?.textContent).toBe('deleted');
  });

  it('renders all heading levels with decreasing size', () => {
    const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const { container } = render(<MarkdownContent text={md} />);
    expect(container.querySelector('h1')).toBeTruthy();
    expect(container.querySelector('h2')).toBeTruthy();
    expect(container.querySelector('h3')).toBeTruthy();
    expect(container.querySelector('h4')).toBeTruthy();
    expect(container.querySelector('h5')).toBeTruthy();
    expect(container.querySelector('h6')).toBeTruthy();
    expect(container.querySelector('h1')?.className).toContain('text-xl');
    expect(container.querySelector('h4')?.className).toContain('text-sm');
    expect(container.querySelector('h6')?.className).toContain('text-muted-foreground');
  });

  it('renders anchor links for hash hrefs', () => {
    const { container } = render(<MarkdownContent text="Go to [section](#test)" />);
    const anchor = container.querySelector('a[href="#test"]');
    expect(anchor).toBeTruthy();
    expect(anchor?.className).toContain('text-primary');
  });
});
