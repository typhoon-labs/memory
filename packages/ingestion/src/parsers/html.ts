import type { ParseResult } from './registry';

export async function parseHtml(content: Buffer, _filename: string): Promise<ParseResult> {
  const TurndownService = (await import('turndown')).default;
  // @ts-ignore — turndown-plugin-gfm has no type declarations; .d.ts not in scope for consumers
  const { gfm } = await import('turndown-plugin-gfm');
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(gfm);

  const html = content.toString('utf-8');
  const markdown = turndown.turndown(html);

  return {
    text: markdown,
    format: 'markdown',
    metadata: {},
  };
}
