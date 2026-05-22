import { ExternalLinkIcon } from 'lucide-react';
import type React from 'react';
import { Children, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

import { CsvTableViewer } from './CsvTableViewer';
import { ExternalLinkDialog } from './ExternalLinkDialog';
import { markdownComponents } from './markdown-components';

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
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'gi');
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index));
    nodes.push(
      <mark key={`h${m.index}`} className="search-match rounded-sm bg-yellow-200/60 text-inherit dark:bg-yellow-500/30">
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

// ── Document-specific markdown overrides ────────────────────────
//
// Layers search-term highlighting and anchor-click handling on top
// of the shared `markdownComponents` base.

/**
 * Build the react-markdown `Components` map used by document content
 * rendering. Pass `terms` to enable inline search-match highlighting; an
 * empty array short-circuits the wrapping with no overhead.
 *
 * @param terms - Search terms to highlight inline
 * @param onAnchorClick - Callback for in-document anchor links (e.g. ToC navigation)
 */
export function createDocumentMarkdownComponents(
  terms: string[] = [],
  onAnchorClick?: (id: string) => void,
): Components {
  // Fast path: no highlighting or anchor handling needed — use shared base directly.
  if (!terms.length && !onAnchorClick) {
    return markdownComponents as unknown as Components;
  }

  return {
    ...(markdownComponents as unknown as Components),
    h1: ({ children, id }) => (
      <h1 id={id} className="mt-6 mb-2 text-xl leading-tight font-semibold first:mt-0">
        {highlightChildren(children, terms)}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className="mt-5 mb-1.5 text-lg leading-tight font-semibold first:mt-0">
        {highlightChildren(children, terms)}
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className="mt-4 mb-1 text-base leading-snug font-semibold first:mt-0">
        {highlightChildren(children, terms)}
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className="mt-3 mb-0.5 text-sm font-semibold first:mt-0">
        {highlightChildren(children, terms)}
      </h4>
    ),
    h5: ({ children, id }) => (
      <h5 id={id} className="mt-3 text-sm font-medium first:mt-0">
        {highlightChildren(children, terms)}
      </h5>
    ),
    h6: ({ children, id }) => (
      <h6 id={id} className="text-muted-foreground mt-3 text-sm font-medium first:mt-0">
        {highlightChildren(children, terms)}
      </h6>
    ),
    p: ({ children }) => (
      <p className="my-2 text-[13px] leading-relaxed break-words first:mt-0 last:mb-0">
        {highlightChildren(children, terms)}
      </p>
    ),
    li: ({ children }) => (
      <li className="pl-4 text-[13px] leading-relaxed break-words [&>p]:inline">
        {highlightChildren(children, terms)}
      </li>
    ),
    a: ({ href, children }) => {
      const isAnchor = href?.startsWith('#');

      // Anchor link — scroll within the document viewer
      if (isAnchor && href) {
        const target = href.slice(1);
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          onAnchorClick?.(target);
        };
        return (
          <a href={href} onClick={handleClick} className="text-primary underline underline-offset-2 hover:opacity-80">
            {highlightChildren(children, terms)}
          </a>
        );
      }

      // External link — show confirmation dialog
      return (
        <ExternalLinkDialog href={href ?? '#'}>
          <button
            type="button"
            className="text-primary inline cursor-pointer underline underline-offset-2 hover:opacity-80"
          >
            {highlightChildren(children, terms)}
            <ExternalLinkIcon className="mb-0.5 ml-0.5 inline size-3 opacity-60" />
          </button>
        </ExternalLinkDialog>
      );
    },
    th: ({ children }) => (
      <th className="border-border border-r px-4 py-2 text-left text-[0.8125rem] font-semibold whitespace-nowrap last:border-r-0">
        {highlightChildren(children, terms)}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-border border-t border-r px-4 py-2 text-sm last:border-r-0">
        {highlightChildren(children, terms)}
      </td>
    ),
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
  /** Callback when an in-document anchor link is clicked (e.g. ToC navigation). */
  onAnchorClick?: (id: string) => void;
}

/**
 * Render parsed document content. Tabular MIME types (CSV, XLSX) flow
 * through `CsvTableViewer`; everything else renders as GFM markdown with
 * the shared style overrides. Both paths support inline search-term
 * highlighting via the optional `searchTerms` prop.
 */
export function DocumentContentViewer({ text, mimeType, searchTerms = [], onAnchorClick }: DocumentContentViewerProps) {
  const components = useMemo(
    () => createDocumentMarkdownComponents(searchTerms, onAnchorClick),
    [searchTerms, onAnchorClick],
  );

  if (isTabularMime(mimeType)) {
    return <CsvTableViewer text={text} searchTerms={searchTerms} />;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
