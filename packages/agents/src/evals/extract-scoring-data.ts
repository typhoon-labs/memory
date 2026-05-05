/**
 * Extracts the three inputs needed by RAG scorers from persisted message JSONB:
 * response text, user question, and retrieved chunk references.
 */

export interface ChunkSource {
  chunkId: string;
  displayIndex: number;
  score?: number;
  /** Populated after hydration from the vector store. */
  text?: string;
  documentId?: string;
  title?: string;
  source?: string;
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
          displayIndex: typeof cs.displayIndex === 'number' ? cs.displayIndex : 0,
          score: typeof cs.score === 'number' ? cs.score : undefined,
          text: typeof cs.text === 'string' ? cs.text : undefined,
          documentId: typeof cs.documentId === 'string' ? cs.documentId : undefined,
          title: typeof cs.title === 'string' ? cs.title : undefined,
          source: typeof cs.source === 'string' ? cs.source : undefined,
        });
      }
    }
  }
  return sources;
}
