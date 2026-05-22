import type { PgVector } from '@typhoon/db/drivers/pg';

/**
 * Enrich slim `_chunkSources` references in message parts with full metadata
 * from the vector store. Mutates messages in place.
 */
export async function hydrateChunkSources(messages: { parts: unknown[] }[], vectorStore: PgVector): Promise<void> {
  // 1. Collect all chunk IDs from all messages
  const chunkIds = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (typeof p.type !== 'string' || !p.type.startsWith('tool-')) continue;
      if (p.state !== 'output-available') continue;
      const output = p.output as Record<string, unknown> | undefined;
      if (!output || !Array.isArray(output._chunkSources)) continue;
      for (const cs of output._chunkSources as Record<string, unknown>[]) {
        if (typeof cs.chunkId === 'string') chunkIds.add(cs.chunkId);
      }
    }
  }

  if (chunkIds.size === 0) return;

  // 2. Batch resolve from vector store
  const rows = await vectorStore.getChunksByIds('knowledge_base', [...chunkIds]);
  const metaMap = new Map(rows.map((r) => [r.id, r.metadata]));

  // 3. Resolve sync target names from IDs in chunk metadata
  const syncTargetIds = new Set<string>();
  for (const meta of metaMap.values()) {
    if (typeof meta.syncTargetId === 'string' && meta.syncTargetId) {
      syncTargetIds.add(meta.syncTargetId);
    }
  }
  const syncTargetNames =
    syncTargetIds.size > 0 ? await vectorStore.getSyncTargetNames([...syncTargetIds]) : new Map<string, string>();

  // 4. Enrich _chunkSources entries
  for (const msg of messages) {
    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (typeof p.type !== 'string' || !p.type.startsWith('tool-')) continue;
      if (p.state !== 'output-available') continue;
      const output = p.output as Record<string, unknown> | undefined;
      if (!output || !Array.isArray(output._chunkSources)) continue;

      output._chunkSources = (output._chunkSources as Record<string, unknown>[]).map((cs) => {
        const meta = metaMap.get(cs.chunkId as string);
        if (!meta) return cs;
        return Object.assign({}, cs, {
          title: meta.title,
          section: meta.section || undefined,
          text: typeof meta.text === 'string' ? (meta.text as string).slice(0, 200) : undefined,
          source: meta.source,
          documentId: meta.documentId,
          startIndex: meta.startIndex,
          syncTargetName: syncTargetNames.get(meta.syncTargetId as string) ?? '',
        });
      });
    }
  }
}
