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
});
