/**
 * Extracts the three inputs needed by RAG scorers from persisted message JSONB:
 * response text, user question, and retrieved chunk references.
 */

export interface ChunkSource {
  chunkId: string;
  /** Hierarchical label from the knowledge search tool, e.g. "1", "1.1". */
  displayIndex: string;
  score?: number;
  /** Populated after hydration from the vector store. */
  text?: string;
  documentId?: string;
  title?: string;
  section?: string;
  source?: string;
  syncTargetName?: string;
}

export interface ScoringData {
  responseText: string;
  userQuestion: string;
  chunkSources: ChunkSource[];
}

/**
 * Extract scoring inputs from an assistant message's content JSONB
 * and the preceding user message's content JSONB.
 *
 * Returns `null` if the message doesn't have enough data to score
 * (e.g., no text content, or content format is unrecognized).
 */
export function extractScoringData(assistantContent: unknown, userContent: unknown): ScoringData | null {
  if (!assistantContent || !userContent) return null;

  const assistant = assistantContent as { format?: number; parts?: unknown[]; content?: string };
  const responseText = extractTextFromContent(assistant);
  if (!responseText) return null;

  const user = userContent as { format?: number; parts?: unknown[]; content?: string };
  const userQuestion = extractTextFromContent(user);
  if (!userQuestion) return null;

  const chunkSources = extractChunkSources(assistant);

  return { responseText, userQuestion, chunkSources };
}

/** Pull plain text from a Mastra message content object. */
function extractTextFromContent(content: { format?: number; parts?: unknown[]; content?: string }): string | null {
  // v6 format: parts array with type: 'text'
  if (Array.isArray(content.parts)) {
    const textParts = content.parts
      .filter((p): p is { type: 'text'; text: string } => {
        const part = p as Record<string, unknown>;
        return part.type === 'text' && typeof part.text === 'string';
      })
      .map((p) => p.text);
    if (textParts.length > 0) return textParts.join('\n');
  }
  // Legacy format: flat content string
  if (typeof content.content === 'string' && content.content.length > 0) {
    return content.content;
  }
  return null;
}

/**
 * Extract `_chunkSources` from tool-invocation parts.
 * Mirrors the pattern in `apps/api/src/routes/hydrate-chunks.ts:12-18`.
 */
function extractChunkSources(content: { parts?: unknown[] }): ChunkSource[] {
  if (!Array.isArray(content.parts)) return [];
  const sources: ChunkSource[] = [];

  for (const part of content.parts) {
    const p = part as Record<string, unknown>;
    if (typeof p.type !== 'string' || !p.type.startsWith('tool-')) continue;

    // Two storage formats:
    // Mastra v4: { type: 'tool-invocation', toolInvocation: { state: 'result', result: { _chunkSources } } }
    // Normalized (AI SDK v6): { type: 'tool-*', state: 'output-available', output: { _chunkSources } }
    let output: Record<string, unknown> | undefined;
    const toolInvocation = p.toolInvocation as Record<string, unknown> | undefined;
    if (toolInvocation?.state === 'result') {
      output = toolInvocation.result as Record<string, unknown> | undefined;
    } else if (p.state === 'output-available') {
      output = p.output as Record<string, unknown> | undefined;
    }
    if (!output || !Array.isArray(output._chunkSources)) continue;

    for (const cs of output._chunkSources as Record<string, unknown>[]) {
      if (typeof cs.chunkId === 'string') {
        sources.push({
          chunkId: cs.chunkId,
          displayIndex: String(cs.displayIndex ?? '0'),
          score: typeof cs.score === 'number' ? cs.score : undefined,
          text: typeof cs.text === 'string' ? cs.text : undefined,
          documentId: typeof cs.documentId === 'string' ? cs.documentId : undefined,
          title: typeof cs.title === 'string' ? cs.title : undefined,
          section: typeof cs.section === 'string' ? cs.section : undefined,
          source: typeof cs.source === 'string' ? cs.source : undefined,
          syncTargetName: typeof cs.syncTargetName === 'string' ? cs.syncTargetName : undefined,
        });
      }
    }
  }
  return sources;
}

// ── Citation formatting for scorers ────────────────────────────────

const CITATION_PATTERN = /\[Source:\s*(.+?)\]/g;
const NUMERIC_CITATION = /^\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*$/;

/**
 * Transform raw agent response text into a scorer-friendly format by
 * collapsing `[Source: 1.1]` or `[Source: 1.1, 1.2]` → `[1]`.
 *
 * No references footer is appended — footer metadata (titles, file paths)
 * is not present in the scorer's context chunks and would be penalised as
 * unsupported claims by faithfulness/hallucination scorers.
 *
 * Returns the original text unchanged when there are no chunk sources.
 */
export function formatResponseForScoring(responseText: string, chunkSources: ChunkSource[]): string {
  if (chunkSources.length === 0) return responseText;

  // Replace inline [Source: ...] patterns with compact [N] references,
  // collapsing chunk-level refs to document-level (e.g. [Source: 1.1, 1.2] → [1])
  return responseText.replace(CITATION_PATTERN, (_match, captured: string) => {
    const trimmed = captured.trim();
    if (NUMERIC_CITATION.test(trimmed)) {
      const refs = trimmed.split(/\s*,\s*/);
      const docNums = [...new Set(refs.map((r) => r.split('.')[0]))];
      return `[${docNums.join(', ')}]`;
    }
    // Non-numeric citation pattern — leave as-is
    return _match;
  });
}
