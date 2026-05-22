import { cleanup, render, screen } from '@testing-library/react';
import type { Components } from 'streamdown';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock streamdown and its dependencies to isolate component behavior
// ---------------------------------------------------------------------------

// Capture components for direct testing
let capturedComponents: Components | undefined;

vi.mock('streamdown', () => ({
  Streamdown: ({
    children,
    isAnimating,
    components,
  }: {
    children: string;
    isAnimating: boolean;
    plugins?: unknown;
    components?: Components;
    caret?: string;
    animated?: unknown;
    remend?: unknown;
    allowedTags?: unknown;
    literalTagContent?: unknown;
    shikiTheme?: unknown;
  }) => {
    capturedComponents = components;
    return (
      <div data-testid="streamdown-root" data-animating={isAnimating}>
        {children}
      </div>
    );
  },
}));

vi.mock('@streamdown/code', () => ({
  createCodePlugin: () => ({}),
}));

vi.mock('@typhoon/ui', () => ({
  ExternalLinkDialog: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <span data-testid="external-link-dialog" data-href={href}>
      {children}
    </span>
  ),
  InlineCitationChip: ({ citation }: { citation: { title: string; index: number } }) => (
    <span data-testid="citation-chip">
      {citation.title}:{citation.index}
    </span>
  ),
  markdownComponents: {},
}));

let mockCitations = new Map();
vi.mock('./citation-context', () => ({
  useCitations: () => ({ citations: mockCitations, onDocumentOpen: vi.fn() }),
}));

vi.mock('streamdown/styles.css', () => ({}));

import { StreamdownText } from './streamdown-text';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StreamdownText', () => {
  it('renders markdown text content', () => {
    render(<StreamdownText text="Hello world" isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('passes isStreaming as isAnimating to Streamdown', () => {
    render(<StreamdownText text="Streaming text" isStreaming />);

    const root = screen.getByTestId('streamdown-root');
    expect(root.getAttribute('data-animating')).toBe('true');
  });

  it('passes isStreaming=false as isAnimating=false to Streamdown', () => {
    render(<StreamdownText text="Static text" isStreaming={false} />);

    const root = screen.getByTestId('streamdown-root');
    expect(root.getAttribute('data-animating')).toBe('false');
  });

  it('renders empty string without crashing', () => {
    const { container } = render(<StreamdownText text="" isStreaming={false} />);

    expect(container.querySelector('[data-testid="streamdown-root"]')).toBeTruthy();
  });

  it('renders text with markdown formatting', () => {
    render(<StreamdownText text="**bold** and *italic*" isStreaming={false} />);

    // The mock renders the raw text; we just verify it passes through
    expect(screen.getByText('**bold** and *italic*')).toBeTruthy();
  });

  it('renders with different text on re-render', () => {
    const { rerender } = render(<StreamdownText text="First message" isStreaming={false} />);

    expect(screen.getByText('First message')).toBeTruthy();

    rerender(<StreamdownText text="Second message" isStreaming={false} />);

    expect(screen.getByText('Second message')).toBeTruthy();
    expect(screen.queryByText('First message')).toBeNull();
  });

  it('renders text with code blocks', () => {
    render(<StreamdownText text="```js\nconsole.log('hello');\n```" isStreaming={false} />);

    // The mock renders raw text since we're not testing Streamdown itself
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with inline code', () => {
    render(<StreamdownText text="Use `const` for constants" isStreaming={false} />);

    expect(screen.getByText('Use `const` for constants')).toBeTruthy();
  });

  it('renders text with links', () => {
    render(<StreamdownText text="Visit [example](https://example.com)" isStreaming={false} />);

    expect(screen.getByText('Visit [example](https://example.com)')).toBeTruthy();
  });

  it('renders text with multiple headings', () => {
    const text = '# Title\n\n## Subtitle\n\n### Section\n\nContent here';
    const { container } = render(<StreamdownText text={text} isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
    expect(container.textContent).toContain('Title');
    expect(container.textContent).toContain('Content here');
  });

  it('renders text with blockquotes', () => {
    render(<StreamdownText text="> This is a quote" isStreaming={false} />);

    expect(screen.getByText('> This is a quote')).toBeTruthy();
  });

  it('renders text with lists', () => {
    const text = '- Item 1\n- Item 2\n- Item 3';
    render(<StreamdownText text={text} isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with tables', () => {
    const text = '| Header 1 | Header 2 |\n|---|---|\n| Cell 1 | Cell 2 |';
    render(<StreamdownText text={text} isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('handles very long text', () => {
    const longText = 'A'.repeat(10000);
    render(<StreamdownText text={longText} isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('handles text with special characters', () => {
    const specialText = '<script>alert("xss")</script> & < >';
    render(<StreamdownText text={specialText} isStreaming={false} />);

    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('toggles streaming state correctly', () => {
    const { rerender } = render(<StreamdownText text="Typing..." isStreaming />);
    expect(screen.getByTestId('streamdown-root').getAttribute('data-animating')).toBe('true');

    rerender(<StreamdownText text="Done typing." isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root').getAttribute('data-animating')).toBe('false');
  });

  it('renders text with citation patterns', () => {
    render(<StreamdownText text="The answer is 42 <cite index='1' title='Guide'>1</cite>" isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with nested markdown structures', () => {
    const text = '1. First item\n   - Sub item\n   - Sub item 2\n2. Second item';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with horizontal rules', () => {
    const text = 'Above\n\n---\n\nBelow';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
    expect(screen.getByText(/Above/)).toBeTruthy();
  });

  it('renders text with mixed inline formatting', () => {
    const text = '**bold** _italic_ ~~strikethrough~~ `code`';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with image syntax', () => {
    const text = '![alt text](https://example.com/image.png)';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with numbered headings', () => {
    const text = '# 1. Introduction\n\n## 1.1 Background\n\nContent';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with multiple code blocks', () => {
    const text = '```python\nprint("hello")\n```\n\nSome text\n\n```bash\necho "world"\n```';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with definition-like formatting', () => {
    const text = '**Term:** Definition of the term\n\n**Another:** Its definition';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders with undefined text gracefully', () => {
    // Edge case: passing empty but valid string
    const { container } = render(<StreamdownText text={''} isStreaming />);
    expect(container.querySelector('[data-testid="streamdown-root"]')).toBeTruthy();
  });

  it('renders text with multiple links', () => {
    const text = 'See [link1](https://a.com) and [link2](https://b.com)';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with anchor links starting with hash', () => {
    const text = 'Jump to [section](#section-id)';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });

  it('renders text with large nested lists', () => {
    const text = '- A\n  - B\n    - C\n      - D\n- E';
    render(<StreamdownText text={text} isStreaming={false} />);
    expect(screen.getByTestId('streamdown-root')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Direct component function tests — exercises the chatComponents factories
// ---------------------------------------------------------------------------

describe('chatComponents (captured from Streamdown)', () => {
  beforeEach(() => {
    capturedComponents = undefined;
    mockCitations = new Map();
  });

  function renderAndCapture() {
    render(<StreamdownText text="capture" isStreaming={false} />);
    expect(capturedComponents).toBeDefined();
    return capturedComponents!;
  }

  it('h1 renders with correct className', () => {
    const comps = renderAndCapture();
    cleanup();
    const H1 = comps.h1 as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<H1>Title</H1>);
    const el = container.querySelector('h1');
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe('Title');
    expect(el!.className).toContain('text-2xl');
  });

  it('h2 renders with correct className', () => {
    const comps = renderAndCapture();
    cleanup();
    const H2 = comps.h2 as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<H2>Sub</H2>);
    const el = container.querySelector('h2');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('text-xl');
  });

  it('h3 renders with correct className', () => {
    const comps = renderAndCapture();
    cleanup();
    const H3 = comps.h3 as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<H3>Section</H3>);
    const el = container.querySelector('h3');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('text-lg');
  });

  it('h4 renders with correct className', () => {
    const comps = renderAndCapture();
    cleanup();
    const H4 = comps.h4 as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<H4>Small</H4>);
    const el = container.querySelector('h4');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('text-base');
  });

  it('p renders as paragraph', () => {
    const comps = renderAndCapture();
    cleanup();
    const P = comps.p as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<P>Text here</P>);
    const el = container.querySelector('p');
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe('Text here');
  });

  it('li renders as list item', () => {
    const comps = renderAndCapture();
    cleanup();
    const Li = comps.li as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <ul>
        <Li>Item</Li>
      </ul>,
    );
    const el = container.querySelector('li');
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe('Item');
  });

  it('a renders external link with ExternalLinkDialog', () => {
    const comps = renderAndCapture();
    cleanup();
    const A = comps.a as React.FC<{ children: React.ReactNode; href?: string }>;
    const { container } = render(<A href="https://example.com">Link</A>);
    const dialog = container.querySelector('[data-testid="external-link-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('data-href')).toBe('https://example.com');
  });

  it('a renders anchor link without ExternalLinkDialog', () => {
    const comps = renderAndCapture();
    cleanup();
    const A = comps.a as React.FC<{ children: React.ReactNode; href?: string }>;
    const { container } = render(<A href="#section">Jump</A>);
    const anchor = container.querySelector('a[href="#section"]');
    expect(anchor).toBeTruthy();
    expect(anchor!.textContent).toBe('Jump');
  });

  it('inlineCode renders code with mono font', () => {
    const comps = renderAndCapture();
    cleanup();
    const IC = comps.inlineCode as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<IC>const x</IC>);
    const el = container.querySelector('code');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('font-mono');
  });

  it('pre renders with border and font-mono', () => {
    const comps = renderAndCapture();
    cleanup();
    const Pre = comps.pre as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<Pre>code block</Pre>);
    const el = container.querySelector('pre');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('font-mono');
  });

  it('blockquote renders with italic styling', () => {
    const comps = renderAndCapture();
    cleanup();
    const BQ = comps.blockquote as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<BQ>Quote</BQ>);
    const el = container.querySelector('blockquote');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('italic');
  });

  it('th renders table header cell', () => {
    const comps = renderAndCapture();
    cleanup();
    const Th = comps.th as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <table>
        <thead>
          <tr>
            <Th>Header</Th>
          </tr>
        </thead>
      </table>,
    );
    const el = container.querySelector('th');
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe('Header');
  });

  it('td renders table data cell', () => {
    const comps = renderAndCapture();
    cleanup();
    const Td = comps.td as React.FC<{ children: React.ReactNode }>;
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <Td>Cell</Td>
          </tr>
        </tbody>
      </table>,
    );
    const el = container.querySelector('td');
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe('Cell');
  });

  it('cite renders InlineCitationChip with context data', () => {
    mockCitations = new Map([[1, { index: 1, title: 'Source Doc', displayIndex: '1' }]]);
    const comps = renderAndCapture();
    cleanup();
    const Cite = comps.cite as React.FC<{ index?: string; title?: string; display?: string }>;
    const { container } = render(<Cite index="1" title="Fallback" />);
    const chip = container.querySelector('[data-testid="citation-chip"]');
    expect(chip).toBeTruthy();
    // Context data should take priority: "Source Doc" not "Fallback"
    expect(chip!.textContent).toContain('Source Doc');
  });

  it('cite falls back to tag attributes when no context data', () => {
    mockCitations = new Map(); // empty
    const comps = renderAndCapture();
    cleanup();
    const Cite = comps.cite as React.FC<{ index?: string; title?: string; display?: string }>;
    const { container } = render(<Cite index="3" title="Fallback Title" display="3" />);
    const chip = container.querySelector('[data-testid="citation-chip"]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain('Fallback Title');
  });
});
