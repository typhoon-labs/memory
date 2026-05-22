/** Chunk shape used by the document viewer. */
export interface ViewerChunk {
  text: string;
  startIndex: number | null;
}

/**
 * Resolve a single target (startIndex or chunkText) to searchable text lines.
 *
 * Finds a matching chunk from the array by exact startIndex, closest startIndex
 * (within 200), or text prefix match. Then strips markdown headings, bold/italic,
 * bullets, links, and pipe characters, splits into lines, and filters blanks.
 */
export function resolveChunkLines(
  docChunks: ViewerChunk[],
  startIndex: number | undefined,
  chunkText: string | undefined,
): string[] {
  if ((startIndex === null || startIndex === undefined) && !chunkText) return [];

  let chunk: ViewerChunk | undefined;
  if (startIndex !== null && startIndex !== undefined && docChunks.length > 0) {
    chunk = docChunks.find((c) => c.startIndex !== null && c.startIndex !== undefined && c.startIndex === startIndex);
    if (!chunk) {
      let closest: ViewerChunk | undefined;
      let minDist = Number.POSITIVE_INFINITY;
      for (const c of docChunks) {
        if (c.startIndex === null || c.startIndex === undefined) continue;
        const dist = Math.abs(c.startIndex - startIndex);
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
      if (closest && minDist < 200) chunk = closest;
    }
  }
  if (!chunk && chunkText && docChunks.length > 0) {
    const needle = chunkText.slice(0, 100);
    chunk = docChunks.find((c) => c.text.includes(needle) || needle.includes(c.text.slice(0, 100)));
  }

  const sourceText = chunk?.text ?? chunkText;
  if (!sourceText) return [];

  return sourceText
    .replaceAll(/^#{1,6}\s+/gm, '')
    .replaceAll(/\*\*(.+?)\*\*/g, '$1')
    .replaceAll(/\*(.+?)\*/g, '$1')
    .replaceAll(/^\s*[-*+]\s+/gm, '')
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replaceAll('|', ' ')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 8);
}

/**
 * Cycle an index forward or backward within a total count, wrapping around.
 *
 * - `next`: `(current + 1) % total`
 * - `prev`: `(current - 1 + total) % total`
 *
 * Returns 0 when total is 0 to avoid NaN from modulo by zero.
 */
export function cycleIndex(current: number, total: number, direction: 'next' | 'prev'): number {
  if (total === 0) return 0;
  if (direction === 'next') return (current + 1) % total;
  return (current - 1 + total) % total;
}
