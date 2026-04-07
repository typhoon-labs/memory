import type React from 'react';
import { Children, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CsvTableViewer } from './CsvTableViewer.js';

// ── Tabular MIME detection ──────────────────────────────────────

const TABULAR_MIME_TYPES = new Set(['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

function isTabularMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && TABULAR_MIME_TYPES.has(mimeType);
}

// ── Search term highlighting ────────────────────────────────────
//
// When `searchTerms` is non-empty we wrap matching string nodes in
// <mark className="search-match …"> so callers (e.g. desk's match
// navigator) can find them via querySelectorAll('mark.search-match').

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'gi');
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index));
    nodes.push(
      <mark key={`h${m.index}`} className="search-match rounded-sm bg-primary/10 text-inherit">
        {m[0]}
      </mark>,
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : text;
}

/** Recursively walk React children, applying highlightText to string nodes. */
function highlightChildren(children: React.ReactNode, terms: string[]): React.ReactNode {
  if (!terms.length) return children;
  return Children.map(children, (child) => {
    if (typeof child === 'string') return highlightText(child, terms);
    return child;
  });
}

// ── Markdown component overrides ────────────────────────────────

/**
 * Build the react-markdown `Components` map used by document content
 * rendering. Pass `terms` to enable inline search-match highlighting; an
 * empty array short-circuits the wrapping with no overhead.
 */
export function createDocumentMarkdownComponents(terms: string[] = []): Components {
  return {
    h1: ({ children }) => (
      <h1 className="mt-6 border-b border-border pb-2 text-lg font-semibold first:mt-0">
        {highlightChildren(children, terms)}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-6 text-base font-semibold first:mt-0">{highlightChildren(children, terms)}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 text-sm font-semibold first:mt-0">{highlightChildren(children, terms)}</h3>
    ),
    h4: ({ children }) => <h4 className="mt-3 text-sm font-medium first:mt-0">{highlightChildren(children, terms)}</h4>,
    h5: ({ children }) => (
      <h5 className="mt-3 text-[13px] font-medium first:mt-0">{highlightChildren(children, terms)}</h5>
    ),
    h6: ({ children }) => (
      <h6 className="mt-3 text-[13px] font-medium text-muted-foreground first:mt-0">
        {highlightChildren(children, terms)}
      </h6>
    ),
    p: ({ children }) => (
      <p className="mt-2 text-[13px] leading-relaxed first:mt-0">{highlightChildren(children, terms)}</p>
    ),
    li: ({ children }) => <li className="mt-1 text-[13px] leading-relaxed">{highlightChildren(children, terms)}</li>,
    ul: ({ children }) => <ul className="mt-2 list-disc space-y-0.5 pl-5 first:mt-0">{children}</ul>,
    ol: ({ children }) => <ol className="mt-2 list-decimal space-y-0.5 pl-5 first:mt-0">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-[13px] text-muted-foreground first:mt-0">
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
        {highlightChildren(children, terms)}
      </a>
    ),
    code: ({ className, children }) => {
      if (className?.includes('language-')) {
        return <code className={className}>{children}</code>;
      }
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground/80">{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[0.8rem] leading-relaxed first:mt-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="mt-3 overflow-x-auto rounded-md border border-border first:mt-0">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border bg-muted/50">{children}</thead>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {highlightChildren(children, terms)}
      </th>
    ),
    td: ({ children }) => <td className="border-t border-border px-3 py-2">{highlightChildren(children, terms)}</td>,
    hr: () => <hr className="my-4 border-border" />,
    strong: ({ children }) => <strong className="font-semibold">{highlightChildren(children, terms)}</strong>,
    em: ({ children }) => <em>{highlightChildren(children, terms)}</em>,
    del: ({ children }) => <del className="text-muted-foreground">{highlightChildren(children, terms)}</del>,
  };
}

// ── Public component ────────────────────────────────────────────

export interface DocumentContentViewerProps {
  /** Full document text to render. */
  text: string;
  /** MIME type — used to pick the renderer (CSV viewer vs markdown). */
  mimeType: string | null | undefined;
  /** Optional search terms to highlight inline. Pass `[]` for no highlighting. */
  searchTerms?: string[];
}

/**
 * Render parsed document content. Tabular MIME types (CSV, XLSX) flow
 * through `CsvTableViewer`; everything else renders as GFM markdown with
 * the shared style overrides. Both paths support inline search-term
 * highlighting via the optional `searchTerms` prop.
 */
export function DocumentContentViewer({ text, mimeType, searchTerms = [] }: DocumentContentViewerProps) {
  const components = useMemo(() => createDocumentMarkdownComponents(searchTerms), [searchTerms]);

  if (isTabularMime(mimeType)) {
    return <CsvTableViewer text={text} searchTerms={searchTerms} />;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
