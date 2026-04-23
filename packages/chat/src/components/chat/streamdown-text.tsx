import { createCodePlugin } from '@streamdown/code';
import { InlineCitationChip } from '@typhoon/ui';
import { type Components, Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useCitations } from './citation-context';

const code = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});

const components: Components = {
  // Headings
  h1: ({ children, ...props }) => (
    <h1 className="mt-6 mb-2 text-2xl font-semibold leading-tight first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mt-5 mb-2 text-xl font-semibold leading-tight first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-4 mb-1.5 text-lg font-semibold leading-snug first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props}>
      {children}
    </h4>
  ),

  // Text
  p: ({ children, ...props }) => (
    <p className="my-2 first:mt-0 last:mb-0" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),

  // Lists
  ul: ({ children, ...props }) => (
    <ul className="my-2 list-inside list-disc space-y-0.5 [&_ul]:my-1 [&_ul]:list-[circle]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2 list-inside list-decimal space-y-0.5 [&_ol]:my-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-4 [&>p]:inline" {...props}>
      {children}
    </li>
  ),

  // Code
  inlineCode: ({ children, ...props }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125em]" {...props}>
      {children}
    </code>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="my-4 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[0.8125rem] leading-relaxed"
      {...props}
    >
      {children}
    </pre>
  ),

  // Blockquote
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-3 rounded-r border-l-[3px] border-border bg-muted px-4 py-2 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Tables
  table: ({ children, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="whitespace-nowrap px-4 py-2 text-left text-[0.8125rem] font-semibold" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-t border-border px-4 py-2 text-sm" {...props}>
      {children}
    </td>
  ),

  // Horizontal rule
  hr: ({ ...props }) => <hr className="my-6 border-t border-border" {...props} />,
};

/**
 * Bridge component that maps streamdown's `<cite>` element props
 * (from allowedTags) to the InlineCitationChip via CitationContext.
 *
 * Citation data can come from two sources:
 * 1. CitationContext (populated from tool outputs when available)
 * 2. The `title` attribute on the `<cite>` tag itself (always available)
 *
 * In a supervisor→knowledge-agent architecture, the RAG search results
 * live in the sub-agent's context and aren't exposed at the message level.
 * The `title` attribute is the reliable fallback in that case.
 */
function CiteElement({
  index,
  title,
  display,
}: {
  index?: string;
  title?: string;
  display?: string;
  children?: React.ReactNode;
}) {
  const { citations, onDocumentOpen } = useCitations();
  const idx = Number(index);
  const contextData = citations.get(idx);

  // Build citation data: prefer context data, fall back to tag attributes
  const citation = contextData ?? {
    index: Number.isFinite(idx) ? idx : 1,
    title: title ?? `Source ${String(index ?? '?')}`,
    displayIndex: display ?? index ?? '1',
  };

  return <InlineCitationChip citation={citation} onDocumentOpen={onDocumentOpen} />;
}

const allComponents: Components = {
  ...components,
  cite: CiteElement as Components['cite'],
};

export function StreamdownText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <Streamdown
      plugins={{ code }}
      components={allComponents}
      caret="circle"
      isAnimating={isStreaming}
      animated={{ animation: 'blurIn', duration: 200, easing: 'ease-out', sep: 'char' }}
      remend={{ htmlTags: true }}
      allowedTags={{ cite: ['index', 'title', 'display'] }}
      literalTagContent={['cite']}
      shikiTheme={['github-light', 'github-dark']}
    >
      {text}
    </Streamdown>
  );
}
