import type { ParseResult } from './registry';

export async function parseDocx(buffer: Buffer, _filename: string): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const TurndownService = (await import('turndown')).default;

  const result = await mammoth.convertToHtml({ buffer });

  // @ts-ignore — turndown-plugin-gfm has no type declarations; .d.ts not in scope for consumers
  const { gfm } = await import('turndown-plugin-gfm');
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(gfm);
  const markdown = turndown.turndown(result.value);

  return {
    text: markdown,
    format: 'markdown',
    metadata: {},
  };
}
