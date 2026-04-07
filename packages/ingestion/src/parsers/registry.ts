import { parseDocx } from './docx.js';
import { parseHtml } from './html.js';
import { parsePdf } from './pdf.js';
import { parseXlsx } from './xlsx.js';

export interface ParseResult {
  text: string;
  format: 'text' | 'html' | 'markdown' | 'json';
  metadata: {
    title?: string;
    author?: string;
    pageCount?: number;
  };
}

type ParserFn = (buffer: Buffer, filename: string) => Promise<ParseResult>;

const parsers: Record<string, ParserFn> = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.xlsx': parseXlsx,
  '.html': parseHtml,
  '.htm': parseHtml,
};

export function getParser(filename: string): ParserFn | undefined {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return parsers[ext];
}

export function getMDocFormat(filename: string): 'text' | 'html' | 'markdown' | 'json' {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.md':
    case '.mdx':
      return 'markdown';
    case '.json':
      return 'json';
    default:
      return 'text';
  }
}

export function needsCustomParser(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ext in parsers;
}
