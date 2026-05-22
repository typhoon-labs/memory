import type { ParseResult } from './registry';

let patched = false;

function applyBunPatch() {
  if (!patched) {
    const orig = globalThis.structuredClone;
    globalThis.structuredClone = ((obj: unknown, opts?: StructuredSerializeOptions) => {
      if (opts?.transfer) return orig(obj);
      return orig(obj, opts);
    }) as typeof structuredClone;
    patched = true;
  }
}

// ── Types ──────────────────────────────────────────────────────

interface TextItemLike {
  str: string;
  transform: number[];
  fontName: string;
  hasEOL: boolean;
  width: number;
  height: number;
}

interface LineItem {
  str: string;
  x: number;
  fontSize: number;
  fontName: string;
  width: number;
}

interface Line {
  y: number;
  items: LineItem[];
}

// ── Helpers ────────────────────────────────────────────────────

const Y_TOLERANCE = 2;
const COLUMN_TOLERANCE = 5;
const MIN_TABLE_ROWS = 3;
const MIN_TABLE_COLS = 2;
const LIST_INDENT_THRESHOLD = 15;
const LIST_MARKER_RE = /^[•\-–*]\s|^\d+[.)]\s|^[a-z][.)]\s/;

export function getFontSize(transform: number[]): number {
  return Math.hypot(transform[0], transform[1]);
}

export function roundSize(size: number): number {
  return Math.round(size * 10) / 10;
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// ── Font analysis ──────────────────────────────────────────────

export function buildHeadingMap(items: TextItemLike[]): Map<number, string> {
  const freq = new Map<number, number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const size = roundSize(getFontSize(item.transform));
    freq.set(size, (freq.get(size) ?? 0) + item.str.length);
  }

  let maxWeight = 0;
  let bodySize = 12;
  for (const [size, weight] of freq) {
    if (weight > maxWeight) {
      maxWeight = weight;
      bodySize = size;
    }
  }

  const headingSizes = [...freq.keys()]
    .filter((s) => s > bodySize + 0.3)
    .slice()
    .sort((a, b) => b - a);
  const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
  const map = new Map<number, string>();
  for (let i = 0; i < Math.min(headingSizes.length, tags.length); i++) {
    map.set(headingSizes[i], tags[i]);
  }
  return map;
}

// ── Line grouping ──────────────────────────────────────────────

export function groupIntoLines(items: TextItemLike[]): Line[] {
  const lines: Line[] = [];
  let currentLine: Line | null = null;

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = roundSize(getFontSize(item.transform));

    // Skip whitespace-only items (PDF often has space items between table columns)
    if (!item.str.trim()) continue;

    const lineItem: LineItem = { str: item.str, x, fontSize, fontName: item.fontName, width: item.width };

    if (!currentLine || Math.abs(y - currentLine.y) > Y_TOLERANCE) {
      currentLine = { y, items: [lineItem] };
      lines.push(currentLine);
    } else {
      currentLine.items.push(lineItem);
    }
  }

  // Sort items within each line by x-position (left to right)
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }

  return lines;
}

// ── Body x-baseline (for list detection) ───────────────────────

export function getBodyXBaseline(lines: Line[], headingMap: Map<number, string>): number {
  const xFreq = new Map<number, number>();
  for (const line of lines) {
    if (line.items.length === 0) continue;
    const first = line.items[0];
    if (headingMap.has(first.fontSize)) continue;
    const rounded = Math.round(first.x);
    xFreq.set(rounded, (xFreq.get(rounded) ?? 0) + 1);
  }
  let maxCount = 0;
  let baseline = 60;
  for (const [x, count] of xFreq) {
    if (count > maxCount) {
      maxCount = count;
      baseline = x;
    }
  }
  return baseline;
}

// ── Table detection ────────────────────────────────────────────

export function getColumnSignature(line: Line): number[] {
  return line.items.map((item) => Math.round(item.x / COLUMN_TOLERANCE) * COLUMN_TOLERANCE);
}

export function signaturesMatch(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > COLUMN_TOLERANCE) return false;
  }
  return true;
}

/** Find table regions: runs of 3+ consecutive lines with the same column structure (2+ cols). */
export function detectTableRegions(lines: Line[], headingMap: Map<number, string>): Set<number> {
  const tableLineIndices = new Set<number>();
  let runStart = -1;
  let runEnd = -1;
  let runSig: number[] | null = null;

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : null;
    const isCandidate = line && line.items.length >= MIN_TABLE_COLS && !headingMap.has(line.items[0].fontSize);
    const sig = isCandidate ? getColumnSignature(line) : null;
    const matches = sig && sig.length >= MIN_TABLE_COLS && runSig && signaturesMatch(sig, runSig);

    if (matches) {
      runEnd = i + 1;
    } else {
      // Flush previous run
      if (runStart >= 0 && runEnd - runStart >= MIN_TABLE_ROWS) {
        for (let j = runStart; j < runEnd; j++) tableLineIndices.add(j);
      }
      // Start new run if current line is a candidate
      if (isCandidate && sig && sig.length >= MIN_TABLE_COLS) {
        runStart = i;
        runEnd = i + 1;
        runSig = sig;
      } else {
        runStart = -1;
        runSig = null;
      }
    }
  }

  return tableLineIndices;
}

// ── HTML generation ────────────────────────────────────────────

export function lineToText(line: Line): string {
  return line.items.map((item) => item.str).join(' ');
}

export function buildHtml(lines: Line[], headingMap: Map<number, string>): string {
  const tableLines = detectTableRegions(lines, headingMap);
  const bodyBaseline = getBodyXBaseline(lines, headingMap);
  const parts: string[] = [];

  let inTable = false;
  let inList = false;
  let paragraphParts: string[] = [];

  function flushParagraph() {
    if (paragraphParts.length > 0) {
      parts.push(`<p>${escapeHtml(paragraphParts.join('\n'))}</p>`);
      paragraphParts = [];
    }
  }

  function closeList() {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  }

  function closeTable() {
    if (inTable) {
      parts.push('</tbody></table>');
      inTable = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.items.length === 0) continue;

    const firstItem = line.items[0];
    const text = lineToText(line);
    const headingTag = headingMap.get(firstItem.fontSize);

    // ── Table line ──
    if (tableLines.has(i)) {
      flushParagraph();
      closeList();
      if (!inTable) {
        // First row of table → thead
        parts.push('<table>');
        parts.push(
          `<thead><tr>${line.items.map((item) => `<th>${escapeHtml(item.str.trim())}</th>`).join('')}</tr></thead>`,
        );
        parts.push('<tbody>');
        inTable = true;
        continue;
      }
      parts.push(`<tr>${line.items.map((item) => `<td>${escapeHtml(item.str.trim())}</td>`).join('')}</tr>`);
      continue;
    }

    closeTable();

    // ── Heading ──
    if (headingTag) {
      flushParagraph();
      closeList();
      parts.push(`<${headingTag}>${escapeHtml(text.trim())}</${headingTag}>`);
      continue;
    }

    // ── List item ──
    const indent = firstItem.x - bodyBaseline;
    if (indent > LIST_INDENT_THRESHOLD && LIST_MARKER_RE.test(text.trim())) {
      flushParagraph();
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      // Strip the bullet/number marker from the text
      const cleaned = text.trim().replace(LIST_MARKER_RE, '');
      parts.push(`<li>${escapeHtml(cleaned)}</li>`);
      continue;
    }

    // ── Body text ──
    closeTable();
    closeList();
    paragraphParts.push(text.trim());

    // Flush paragraph on blank-ish gap (check if next line is far away in y)
    const nextLine = lines[i + 1];
    if (!nextLine || Math.abs(line.y - nextLine.y) > line.items[0].fontSize * 1.8) {
      flushParagraph();
    }
  }

  flushParagraph();
  closeList();
  closeTable();

  return parts.join('\n');
}

// ── Main parser ────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer, _filename: string): Promise<ParseResult> {
  applyBunPatch();

  const { getDocumentProxy, getMeta } = await import('unpdf');
  const TurndownService = (await import('turndown')).default;
  const data = new Uint8Array(buffer);

  const metaResult = await getMeta(data);
  const pdf = await getDocumentProxy(data);
  const allItems: TextItemLike[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    // oxlint-disable-next-line no-await-in-loop -- sequential: PDF pages must be processed in order
    const page = await pdf.getPage(i);
    // oxlint-disable-next-line no-await-in-loop -- sequential: depends on page above
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str !== null && item.str !== undefined) {
        allItems.push(item as TextItemLike);
      }
    }
  }

  if (allItems.length === 0) {
    return { text: '', format: 'markdown', metadata: {} };
  }

  const headingMap = buildHeadingMap(allItems);
  const lines = groupIntoLines(allItems);
  const html = buildHtml(lines, headingMap);

  // @ts-ignore — turndown-plugin-gfm has no type declarations; .d.ts not in scope for consumers
  const { gfm } = await import('turndown-plugin-gfm');
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(gfm);
  const markdown = turndown.turndown(html);

  return {
    text: markdown,
    format: 'markdown',
    metadata: {
      title: (metaResult.info?.Title as string) || undefined,
      author: (metaResult.info?.Author as string) || undefined,
      pageCount: pdf.numPages,
    },
  };
}
