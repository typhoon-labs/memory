/**
 * Markdown, as the card and the chat show it. `renderMarkdown` of
 * @a2ui/markdown-it turns it into HTML and sanitizes that (DOMPurify). Until
 * it has answered, the text is shown as it was sent.
 */
import { renderMarkdown } from '@a2ui/markdown-it';
import { useEffect, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const PROSE =
  '[&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1';

export function Markdown({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    renderMarkdown(text).then(
      (rendered) => {
        if (current) setHtml(rendered);
      },
      (err) => console.error('Markdown was not rendered', err),
    );
    return () => {
      current = false;
    };
  }, [text]);

  return html === null ? (
    <div className={cn(PROSE, 'whitespace-pre-wrap', className)} style={style}>
      {text}
    </div>
  ) : (
    <div className={cn(PROSE, className)} style={style} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
