import type { ParseResult } from './registry.js';

export async function parseDocx(buffer: Buffer, _filename: string): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer });

  return {
    text: result.value,
    format: 'html',
    metadata: {},
  };
}
