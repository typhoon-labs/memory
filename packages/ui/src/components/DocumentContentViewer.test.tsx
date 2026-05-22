import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentContentViewer, createDocumentMarkdownComponents } from './DocumentContentViewer';

afterEach(cleanup);

describe('DocumentContentViewer', () => {
  it('renders markdown text', () => {
    const { container } = render(<DocumentContentViewer text="# Hello World" mimeType="text/markdown" />);
    expect(container.textContent).toContain('Hello World');
  });

  it('renders CSV text as a table', () => {
    const { container } = render(<DocumentContentViewer text="Name,Age\nAlice,30" mimeType="text/csv" />);
    expect(container.textContent).toContain('Alice');
  });

  it('renders plain text', () => {
    const { container } = render(<DocumentContentViewer text="Plain text here" mimeType="text/plain" />);
    expect(container.textContent).toContain('Plain text here');
  });

  it('renders XLSX MIME type through CsvTableViewer', () => {
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const { container } = render(<DocumentContentViewer text="Col1,Col2\nA,B" mimeType={xlsx} />);
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).toContain('Col1');
    expect(container.textContent).toContain('A');
  });

  it('renders CSV with multiple rows correctly', () => {
    const csv = 'Name,Score\nAlice,90\nBob,85\nCharlie,92';
    const { container } = render(<DocumentContentViewer text={csv} mimeType="text/csv" />);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Charlie');
    const rows = container.querySelectorAll('tr');
    // header + 3 data rows
    expect(rows.length).toBe(4);
  });

  it('renders plain text as markdown paragraphs', () => {
    const { container } = render(<DocumentContentViewer text={'Line one\n\nLine two'} mimeType="text/plain" />);
    expect(container.textContent).toContain('Line one');
    expect(container.textContent).toContain('Line two');
    // Content is rendered via markdown, so at least one <p> should exist
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders null mimeType as markdown', () => {
    const { container } = render(<DocumentContentViewer text="**Bold text**" mimeType={null} />);
    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe('Bold text');
  });

  it('renders undefined mimeType as markdown', () => {
    const { container } = render(<DocumentContentViewer text="*Italic*" mimeType={undefined} />);
    const em = container.querySelector('em');
    expect(em).toBeTruthy();
    expect(em?.textContent).toBe('Italic');
  });

  it('highlights search terms in markdown content', () => {
    const { container } = render(
      <DocumentContentViewer text="The quick brown fox" mimeType="text/markdown" searchTerms={['quick']} />,
    );
    const marks = container.querySelectorAll('mark.search-match');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('quick');
  });

  it('highlights multiple search terms', () => {
    const { container } = render(
      <DocumentContentViewer text="The quick brown fox" mimeType="text/markdown" searchTerms={['quick', 'fox']} />,
    );
    const marks = container.querySelectorAll('mark.search-match');
    expect(marks.length).toBe(2);
  });

  it('does not highlight when searchTerms is empty', () => {
    const { container } = render(
      <DocumentContentViewer text="No highlights here" mimeType="text/markdown" searchTerms={[]} />,
    );
    const marks = container.querySelectorAll('mark.search-match');
    expect(marks.length).toBe(0);
  });

  it('calls onAnchorClick when an anchor link is clicked', () => {
    const onAnchorClick = vi.fn();
    const { container } = render(
      <DocumentContentViewer
        text="Click [here](#section-1) for more."
        mimeType="text/markdown"
        onAnchorClick={onAnchorClick}
      />,
    );
    const anchor = container.querySelector('a[href="#section-1"]');
    expect(anchor).toBeTruthy();
    fireEvent.click(anchor!);
    expect(onAnchorClick).toHaveBeenCalledWith('section-1');
  });

  it('renders external links with an ExternalLinkDialog button', () => {
    const { container } = render(
      <DocumentContentViewer
        text="Visit [example](https://example.com)"
        mimeType="text/markdown"
        searchTerms={['example']}
      />,
    );
    // External links render as a button (not an <a>)
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('example');
  });
});

describe('createDocumentMarkdownComponents', () => {
  it('returns shared base when no terms or anchor handler', () => {
    const components = createDocumentMarkdownComponents([], undefined);
    // Should be the base markdownComponents reference
    expect(components).toBeDefined();
  });

  it('returns custom components when terms are provided', () => {
    const components = createDocumentMarkdownComponents(['test']);
    expect(components).toBeDefined();
    // Should have overridden heading components
    expect(typeof components.h1).toBe('function');
    expect(typeof components.p).toBe('function');
  });

  it('returns custom components when onAnchorClick is provided', () => {
    const components = createDocumentMarkdownComponents([], () => {});
    expect(components).toBeDefined();
    expect(typeof components.a).toBe('function');
  });
});

describe('createDocumentMarkdownComponents element renderers', () => {
  it('renders h1 with search term highlighting', () => {
    const comps = createDocumentMarkdownComponents(['world']);
    const H1 = comps.h1 as React.FC<{ children: React.ReactNode; id?: string }>;
    const { container } = render(<H1 id="heading-1">Hello world</H1>);
    const el = container.querySelector('h1');
    expect(el).toBeTruthy();
    expect(el!.id).toBe('heading-1');
    const mark = container.querySelector('mark.search-match');
    expect(mark).toBeTruthy();
    expect(mark!.textContent).toBe('world');
  });

  it('renders h2 with search term highlighting', () => {
    const comps = createDocumentMarkdownComponents(['heading']);
    const H2 = comps.h2 as React.FC<{ children: React.ReactNode; id?: string }>;
    const { container } = render(<H2 id="h2-1">A heading here</H2>);
    expect(container.querySelector('h2')).toBeTruthy();
    expect(container.querySelector('mark.search-match')?.textContent).toBe('heading');
  });

  it('renders h3 through h6 with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['term']);
    for (const tag of ['h3', 'h4', 'h5', 'h6'] as const) {
      const Comp = comps[tag] as React.FC<{ children: React.ReactNode; id?: string }>;
      const { container } = render(<Comp id={`${tag}-1`}>A term here</Comp>);
      expect(container.querySelector(tag)).toBeTruthy();
      expect(container.querySelector('mark.search-match')?.textContent).toBe('term');
      cleanup();
    }
  });

  it('renders p with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['fox']);
    const P = comps.p as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<P>The quick fox</P>);
    expect(container.querySelector('p')).toBeTruthy();
    expect(container.querySelector('mark.search-match')?.textContent).toBe('fox');
  });

  it('renders li with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['item']);
    const Li = comps.li as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <ul>
        <Li>List item</Li>
      </ul>,
    );
    expect(container.querySelector('li')).toBeTruthy();
    expect(container.querySelector('mark.search-match')?.textContent).toBe('item');
  });

  it('renders th and td with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['data']);
    const Th = comps.th as React.FC<{ children: React.ReactNode }>;
    const Td = comps.td as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <table>
        <thead>
          <tr>
            <Th>data header</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>data cell</Td>
          </tr>
        </tbody>
      </table>,
    );
    const marks = container.querySelectorAll('mark.search-match');
    expect(marks.length).toBe(2);
  });

  it('renders strong and em with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['bold']);
    const Strong = comps.strong as React.FC<{ children: React.ReactNode }>;
    const Em = comps.em as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <div>
        <Strong>bold text</Strong>
        <Em>bold italic</Em>
      </div>,
    );
    expect(container.querySelectorAll('mark.search-match').length).toBe(2);
  });

  it('renders del with highlighting', () => {
    const comps = createDocumentMarkdownComponents(['old']);
    const Del = comps.del as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<Del>old text</Del>);
    expect(container.querySelector('del')).toBeTruthy();
    expect(container.querySelector('mark.search-match')?.textContent).toBe('old');
  });

  it('renders anchor link and calls onAnchorClick', () => {
    const onAnchorClick = vi.fn();
    const comps = createDocumentMarkdownComponents(['link'], onAnchorClick);
    const A = comps.a as React.FC<{ children: React.ReactNode; href?: string }>;
    const { container } = render(<A href="#target">link text</A>);
    const anchor = container.querySelector('a[href="#target"]');
    expect(anchor).toBeTruthy();
    fireEvent.click(anchor!);
    expect(onAnchorClick).toHaveBeenCalledWith('target');
  });

  it('renders external link as button with ExternalLinkDialog', () => {
    const comps = createDocumentMarkdownComponents(['ext']);
    const A = comps.a as React.FC<{ children: React.ReactNode; href?: string }>;
    const { container } = render(<A href="https://example.com">ext link</A>);
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain('ext');
  });
});
