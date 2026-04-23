import type { UIMessage } from '@ai-sdk/react';
import type { CitationData, ProgressEvent } from '@typhoon/ui';

/**
 * Mastra-internal tools that should not appear in the user-facing activity tracker.
 * These are invoked by the agent runtime itself (e.g. working memory writes) and
 * carry no useful signal for the end user.
 */
export const HIDDEN_TOOL_NAMES = new Set(['updateWorkingMemory']);

export function getToolName(part: { type: string; toolName?: string }): string {
  return part.toolName ?? part.type.replace(/^tool-/, '');
}

export function isVisibleToolPart(part: { type: string; toolName?: string; state?: string }): boolean {
  if (!part.type.startsWith('tool-')) return false;
  if (part.state === 'input-streaming') return false;
  if (HIDDEN_TOOL_NAMES.has(getToolName(part))) return false;
  return true;
}

export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function formatTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Group `data-tool-progress` parts by their `toolCallId` so each ProgressTracker
 * step receives only the sub-progress lines emitted from inside its own tool
 * call. These parts arrive via Mastra's
 * `context.writer.custom({ type: 'data-tool-progress', ... })` convention;
 * AI SDK v6 surfaces them as `UIMessage.parts` entries with the matching
 * `type` string.
 */
export function collectProgressEvents(message: UIMessage): Map<string, ProgressEvent[]> {
  const map = new Map<string, ProgressEvent[]>();
  for (const part of message.parts) {
    if (part.type !== 'data-tool-progress') continue;
    const data = (part as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null) continue;
    const payload = data as { toolCallId?: unknown; message?: unknown; status?: unknown };
    if (typeof payload.toolCallId !== 'string' || typeof payload.message !== 'string') continue;
    const list = map.get(payload.toolCallId) ?? [];
    list.push({
      message: payload.message,
      status:
        payload.status === 'in-progress' || payload.status === 'done' || payload.status === 'failed'
          ? payload.status
          : undefined,
    });
    map.set(payload.toolCallId, list);
  }
  return map;
}

/**
 * Extract a citation entry from a raw document/chunk object returned by a
 * search tool. Returns `null` when the object lacks a usable title.
 */
function toCitationEntry(doc: Record<string, unknown>): Omit<CitationData, 'index'> | null {
  // Metadata may be nested (hybrid search) or flat (vector/graph search)
  const meta = (typeof doc.metadata === 'object' && doc.metadata !== null ? doc.metadata : doc) as Record<
    string,
    unknown
  >;

  const title = (meta.documentTitle ?? meta.title) as string | undefined;
  if (typeof title !== 'string' || !title) return null;

  const text = (meta.text ?? doc.document) as string | undefined;
  const fullText = typeof text === 'string' ? text : undefined;
  return {
    title,
    section: typeof meta.section === 'string' ? meta.section : undefined,
    documentId: typeof meta.documentId === 'string' ? meta.documentId : undefined,
    source: typeof meta.source === 'string' ? meta.source : undefined,
    snippet: fullText ? fullText.slice(0, 150) : undefined,
    score: typeof doc.score === 'number' ? doc.score : undefined,
  };
}

/**
 * Build a CitationData entry from a `_chunkSources` element.
 * These carry pre-ordered chunk-level data from the knowledge search tool.
 */
function fromChunkSource(src: Record<string, unknown>): Omit<CitationData, 'index'> | null {
  const title = src.title as string | undefined;
  if (typeof title !== 'string' || !title) return null;
  const fullText = typeof src.text === 'string' ? src.text : undefined;
  const sourcePath = typeof src.source === 'string' ? src.source : undefined;
  const targetName = typeof src.syncTargetName === 'string' && src.syncTargetName ? src.syncTargetName : undefined;
  return {
    title,
    section: typeof src.section === 'string' ? src.section : undefined,
    documentId: typeof src.documentId === 'string' ? src.documentId : undefined,
    source: sourcePath,
    snippet: fullText ? fullText.slice(0, 150) : undefined,
    score: typeof src.score === 'number' ? src.score : undefined,
    chunkId: typeof src.chunkId === 'string' ? src.chunkId : undefined,
    startIndex: typeof src.startIndex === 'number' ? src.startIndex : undefined,
    chunkText: fullText,
    displayIndex: typeof src.displayIndex === 'string' ? src.displayIndex : undefined,
    syncSourceName: targetName,
  };
}

/**
 * Extract citations from completed tool outputs. Supports two modes:
 *
 * **Chunk-level** (preferred): When the tool output has `_chunkSources`,
 * each chunk becomes a distinct citation, deduped by `chunkId`.
 *
 * **Legacy** (backward compat): Falls back to document-level extraction
 * from raw search results, deduped by `documentId`.
 */
export function extractCitations(message: UIMessage): CitationData[] {
  const raw: Omit<CitationData, 'index'>[] = [];
  let hasChunkSources = false;

  for (const part of message.parts) {
    if (!part.type.startsWith('tool-')) continue;
    const invocation = part as unknown as { state?: string; output?: unknown };
    if (invocation.state !== 'output-available') continue;
    const result = invocation.output;

    // Shape 1: Array of document objects (vector/graph tools)
    if (Array.isArray(result)) {
      for (const doc of result) {
        if (typeof doc !== 'object' || doc === null) continue;
        const entry = toCitationEntry(doc as Record<string, unknown>);
        if (entry) raw.push(entry);
      }
      continue;
    }

    if (typeof result !== 'object' || result === null) continue;
    const obj = result as Record<string, unknown>;

    // Preferred: ordered chunk sources from the knowledge-search tool
    if (Array.isArray(obj._chunkSources) && obj._chunkSources.length > 0) {
      hasChunkSources = true;
      for (const src of obj._chunkSources) {
        if (typeof src !== 'object' || src === null) continue;
        const entry = fromChunkSource(src as Record<string, unknown>);
        if (entry) raw.push(entry);
      }
      continue;
    }

    // Shape 2: { sources: [...] } (vector/graph/hybrid search tool output)
    if (Array.isArray(obj.sources)) {
      for (const src of obj.sources) {
        if (typeof src === 'object' && src !== null) {
          const entry = toCitationEntry(src as Record<string, unknown>);
          if (entry) raw.push(entry);
        }
      }
    }
  }

  // Chunk-level path: dedup by chunkId (each chunk is distinct)
  if (hasChunkSources) {
    const seen = new Set<string>();
    const deduped: Omit<CitationData, 'index'>[] = [];
    for (const entry of raw) {
      const key = entry.chunkId ?? `${entry.documentId ?? entry.title}::${entry.snippet?.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }
    const chunkCitations = deduped.map((entry, i) => ({ ...entry, index: i + 1 }));

    // Build parent citations for multi-chunk documents so the LLM can cite
    // [Source: N] to reference all chunks from document N as one citation.
    const byDocPrefix = new Map<string, CitationData[]>();
    for (const c of chunkCitations) {
      if (!c.displayIndex?.includes('.')) continue;
      const prefix = c.displayIndex.split('.')[0];
      const group = byDocPrefix.get(prefix) ?? [];
      group.push(c);
      byDocPrefix.set(prefix, group);
    }

    let nextIndex = chunkCitations.length + 1;
    const parents: CitationData[] = [];
    for (const [prefix, children] of byDocPrefix) {
      if (children.length < 2) continue;
      parents.push({
        index: nextIndex++,
        title: children[0].title,
        documentId: children[0].documentId,
        source: children[0].source,
        displayIndex: prefix,
        children,
        syncSourceName: children[0].syncSourceName,
      });
    }

    return [...chunkCitations, ...parents].sort((a, b) => {
      const aNum = Number((a.displayIndex ?? String(a.index)).split('.')[0]);
      const bNum = Number((b.displayIndex ?? String(b.index)).split('.')[0]);
      return aNum - bNum;
    });
  }

  // Legacy path: dedup by documentId (backward compat)
  const seen = new Set<string>();
  const deduped: Omit<CitationData, 'index'>[] = [];
  for (const entry of raw) {
    const key = entry.documentId ?? entry.title;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped.map((entry, i) => ({ ...entry, index: i + 1, displayIndex: String(i + 1) }));
}

/**
 * Extract sub-agent response texts from tool outputs, keyed by part index.
 * With `toolChoice: 'auto'`, the knowledge agent produces a text response
 * with inline `[Source: ...]` citations that Mastra captures in the tool
 * output's `text` field.
 */
export function extractSubAgentTexts(message: UIMessage): Map<number, string> {
  const result = new Map<number, string>();
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (!part.type.startsWith('tool-')) continue;
    const invocation = part as unknown as { state?: string; output?: unknown };
    if (invocation.state !== 'output-available') continue;
    const output = invocation.output;
    if (typeof output !== 'object' || output === null) continue;
    const obj = output as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text && Array.isArray(obj._chunkSources)) {
      result.set(i, obj.text);
    }
  }
  return result;
}

// =============================================================================
// Inline citation post-processing
// =============================================================================

const CITATION_PATTERN = /\[Source:\s*(.+?)\]/g;
const NUMERIC_CITATION = /^\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*$/;
const SEPARATOR = /\s*(?:\u2014|\u2013|--)\s*/; // em-dash, en-dash, double-hyphen

function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Replace `[Source: N]` or `[Source: Title — Section]` patterns in assistant
 * text with `<cite>` tags. Supports both numbered references (new, chunk-level)
 * and title-based references (legacy, document-level).
 *
 * Returns the transformed text and the set of citation indices that were
 * actually referenced, so callers can filter the source footer to only show
 * citations that appear inline.
 */
export function transformCitationPatterns(
  text: string,
  citations: CitationData[],
): { text: string; usedIndices: Set<number> } {
  const usedIndices = new Set<number>();
  if (citations.length === 0) return { text, usedIndices };

  // Build lookup indices
  const byDisplayIndex = new Map<string, CitationData>();
  const byTitle = new Map<string, CitationData>();
  const byTitleSection = new Map<string, CitationData>();
  for (const c of citations) {
    if (c.displayIndex) byDisplayIndex.set(c.displayIndex, c);
    const nt = normalizeTitle(c.title);
    if (!byTitle.has(nt)) byTitle.set(nt, c);
    if (c.section) {
      byTitleSection.set(`${nt}\0${normalizeTitle(c.section)}`, c);
    }
  }

  const transformed = text.replace(CITATION_PATTERN, (_match, captured: string) => {
    const trimmed = captured.trim();

    // Hierarchical reference: [Source: 1.1] or [Source: 1.1, 2]
    // Collapse chunk refs to document-level: [Source: 1.1, 1.2] → single [1]
    if (NUMERIC_CITATION.test(trimmed)) {
      const refs = trimmed.split(/\s*,\s*/);
      const docCites = new Map<string, CitationData>();
      for (const ref of refs) {
        const docNum = ref.split('.')[0];
        if (docCites.has(docNum)) continue;
        // For chunk refs (has dot), prefer parent citation; fall back to chunk
        const citation = ref.includes('.')
          ? (byDisplayIndex.get(docNum) ?? byDisplayIndex.get(ref))
          : byDisplayIndex.get(ref);
        if (citation) docCites.set(docNum, citation);
      }
      if (docCites.size === 0) return '';
      return [...docCites.entries()]
        .map(([docNum, c]) => {
          usedIndices.add(c.index);
          const label = c.section ? `${c.title} \u2014 ${c.section}` : c.title;
          return `<cite index="${c.index}" title="${escapeAttr(label)}" display="${docNum}">${docNum}</cite>`;
        })
        .join('');
    }

    // Legacy: title-based matching
    const parts = captured.split(SEPARATOR);
    const parsedTitle = parts[0].trim();
    const parsedSection = parts.length > 1 ? parts.slice(1).join(' ').trim() : undefined;
    const normParsed = normalizeTitle(parsedTitle);
    const normSection = parsedSection ? normalizeTitle(parsedSection) : undefined;

    let found: CitationData | undefined;
    if (normSection) {
      found = byTitleSection.get(`${normParsed}\0${normSection}`);
    }
    if (!found) {
      found = byTitle.get(normParsed);
    }
    if (!found) {
      for (const c of citations) {
        const nt = normalizeTitle(c.title);
        if (nt.includes(normParsed) || normParsed.includes(nt)) {
          found = c;
          break;
        }
      }
    }
    if (!found) return '';

    usedIndices.add(found.index);
    const displayNum = found.displayIndex?.split('.')[0] ?? String(found.index);
    const label = found.section ? `${found.title} \u2014 ${found.section}` : found.title;
    return `<cite index="${found.index}" title="${escapeAttr(label)}" display="${displayNum}">${displayNum}</cite>`;
  });

  return { text: transformed, usedIndices };
}

/**
 * Transform raw assistant text for clipboard: replaces `[Source: 1.1]`
 * patterns with book-style `[1]` references, collapsing same-document
 * chunk refs (e.g. `[Source: 1.1, 1.2]` → `[1]`).
 */
export function transformCopyText(text: string): string {
  return text.replace(CITATION_PATTERN, (_match, captured: string) => {
    const trimmed = captured.trim();
    if (NUMERIC_CITATION.test(trimmed)) {
      const refs = trimmed.split(/\s*,\s*/);
      const docNums = [...new Set(refs.map((r) => r.split('.')[0]))];
      return `[${docNums.join(', ')}]`;
    }
    // Legacy title-based: strip "Source: " prefix
    return `[${trimmed}]`;
  });
}
