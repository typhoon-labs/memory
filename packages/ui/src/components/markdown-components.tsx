import { ExternalLinkIcon } from 'lucide-react';
import type React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLinkDialog } from './ExternalLinkDialog';

// ── Shared markdown component overrides ────────────────────────
//
// Single source of truth for heading / list / table / code / link
// styling used by both the static `MarkdownContent` renderer and
// `DocumentContentViewer` (which layers search-highlighting and
// anchor-click handling on top).
//
// `StreamdownText` (chat) also imports this map and overrides a
// handful of elements where the chat UI uses larger text sizes.

export const markdownComponents = {
  h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
    <h1 className="mt-6 mb-2 text-xl font-semibold leading-tight first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
    <h2 className="mt-5 mb-1.5 text-lg font-semibold leading-tight first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
    <h3 className="mt-4 mb-1 text-base font-semibold leading-snug first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: React.ComponentProps<'h4'>) => (
    <h4 className="mt-3 mb-0.5 text-sm font-semibold first:mt-0" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }: React.ComponentProps<'h5'>) => (
    <h5 className="mt-3 text-sm font-medium first:mt-0" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }: React.ComponentProps<'h6'>) => (
    <h6 className="mt-3 text-sm font-medium text-muted-foreground first:mt-0" {...props}>
      {children}
    </h6>
  ),
  p: ({ children, ...props }: React.ComponentProps<'p'>) => (
    <p className="my-2 text-[13px] leading-relaxed break-words first:mt-0 last:mb-0" {...props}>
      {children}
    </p>
  ),
  li: ({ children, ...props }: React.ComponentProps<'li'>) => (
    <li className="pl-4 text-[13px] leading-relaxed break-words [&>p]:inline" {...props}>
      {children}
    </li>
  ),
  ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
    <ul className="my-2 list-inside list-disc space-y-0.5 [&_ul]:my-1 [&_ul]:list-[circle]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
    <ol className="my-2 list-inside list-decimal space-y-0.5 [&_ol]:my-1" {...props}>
      {children}
    </ol>
  ),
  blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
    <blockquote
      className="my-3 rounded-r border-l-[3px] border-border bg-muted px-4 py-2 text-[13px] italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }: React.ComponentProps<'a'>) => {
    if (href?.startsWith('#')) {
      return (
        <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80">
          {children}
        </a>
      );
    }
    return (
      <ExternalLinkDialog href={href ?? '#'}>
        <button
          type="button"
          className="inline cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
        >
          {children}
          <ExternalLinkIcon className="ml-0.5 mb-0.5 inline size-3 opacity-60" />
        </button>
      </ExternalLinkDialog>
    );
  },
  code: ({ className, children, ...props }: React.ComponentProps<'code'>) => {
    if (className?.includes('language-')) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground/80" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentProps<'pre'>) => (
    <pre
      className="my-3 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[0.8125rem] leading-relaxed first:mt-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none [&>code]:text-inherit"
      {...props}
    >
      {children}
    </pre>
  ),
  table: ({ children, ...props }: React.ComponentProps<'table'>) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentProps<'thead'>) => (
    <thead className="bg-muted" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ComponentProps<'th'>) => (
    <th
      className="whitespace-nowrap border-r border-border px-4 py-2 text-left text-[0.8125rem] font-semibold last:border-r-0"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentProps<'td'>) => (
    <td className="border-t border-r border-border px-4 py-2 text-sm last:border-r-0" {...props}>
      {children}
    </td>
  ),
  hr: (props: React.ComponentProps<'hr'>) => <hr className="my-6 border-t border-border" {...props} />,
  strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.ComponentProps<'em'>) => <em {...props}>{children}</em>,
  del: ({ children, ...props }: React.ComponentProps<'del'>) => (
    <del className="text-muted-foreground" {...props}>
      {children}
    </del>
  ),
};

// ── Lightweight markdown renderer ──────────────────────────────

export interface MarkdownContentProps {
  /** Markdown text to render. */
  text: string;
  /** Optional wrapper className. */
  className?: string;
}

/**
 * Render a markdown string with shared styling. No search highlighting,
 * no MIME-type routing, no anchor callbacks — just markdown → HTML.
 *
 * Use `DocumentContentViewer` when you need document-specific features
 * (search highlighting, CSV/XLSX rendering, anchor navigation).
 */
export function MarkdownContent({ text, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
