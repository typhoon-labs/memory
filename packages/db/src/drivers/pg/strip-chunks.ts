/**
 * Strip full chunk metadata from `_chunkSources` before persisting messages.
 * Keeps only `{ chunkId, displayIndex }` — the vector store holds the rest,
 * and `hydrateChunkSources` enriches them on thread load.
 */
export function stripChunkSources(content: Record<string, unknown>): Record<string, unknown> {
  const c = content as { format?: number; parts?: unknown[] };
  if (c.format !== 2 || !Array.isArray(c.parts)) return content;

  let modified = false;
  const newParts = c.parts.map((part) => {
    if (typeof part !== 'object' || part === null) return part;
    const p = part as Record<string, unknown>;

    // Mastra v4: { type: 'tool-invocation', toolInvocation: { result: { _chunkSources } } }
    if (p.type === 'tool-invocation' && typeof p.toolInvocation === 'object') {
      const inv = p.toolInvocation as Record<string, unknown>;
      if (typeof inv.result === 'object' && inv.result !== null) {
        const result = inv.result as Record<string, unknown>;
        if (Array.isArray(result._chunkSources) && result._chunkSources.length > 0) {
          modified = true;
          return Object.assign({}, p, {
            toolInvocation: Object.assign({}, inv, {
              result: Object.assign({}, result, {
                _chunkSources: (result._chunkSources as Record<string, unknown>[]).map((cs) => ({
                  chunkId: cs.chunkId,
                  displayIndex: cs.displayIndex,
                })),
              }),
            }),
          });
        }
      }
    }
    return part;
  });

  return modified ? { ...content, parts: newParts } : content;
}
