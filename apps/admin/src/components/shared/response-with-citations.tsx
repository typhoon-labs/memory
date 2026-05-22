import { CitationProvider, SourceCitations, StreamdownText, transformCitationPatterns } from '@typhoon/chat';
import type { CitationData } from '@typhoon/ui';
import { MarkdownContent } from '@typhoon/ui';
import { useMemo } from 'react';

export interface SourceEntry {
  chunkId: string;
  displayIndex: string;
  title?: string;
  section?: string;
  source?: string;
  syncTargetName?: string;
  documentId?: string;
  startIndex?: number;
  score?: number;
}

/** Convert stored chunk sources to CitationData for rendering. */
function sourcesToCitations(sources: SourceEntry[]): CitationData[] {
  const chunks: CitationData[] = sources.map((s, i) => ({
    index: i + 1,
    title: s.title ?? '',
    section: s.section,
    documentId: s.documentId,
    source: s.source,
    score: s.score,
    chunkId: s.chunkId,
    startIndex: s.startIndex,
    displayIndex: s.displayIndex,
    syncSourceName: s.syncTargetName,
  }));

  // Build parent citations for multi-chunk documents (e.g. chunks 1.1, 1.2 → parent [1])
  const byDocPrefix = new Map<string, CitationData[]>();
  for (const c of chunks) {
    if (!c.displayIndex?.includes('.')) continue;
    const prefix = c.displayIndex.split('.')[0];
    const group = byDocPrefix.get(prefix) ?? [];
    group.push(c);
    byDocPrefix.set(prefix, group);
  }

  let nextIndex = chunks.length + 1;
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

  return [...chunks, ...parents];
}

/**
 * Renders response text with citation badges and a collapsible sources footer.
 * Falls back to plain MarkdownContent when no sources are available.
 */
export function ResponseWithCitations({ text, sources }: { text: string; sources?: SourceEntry[] }) {
  const citations = useMemo(() => (sources?.length ? sourcesToCitations(sources) : []), [sources]);
  const citationMap = useMemo(() => new Map(citations.map((c) => [c.index, c])), [citations]);

  if (citations.length === 0) {
    return <MarkdownContent text={text} />;
  }

  const { text: transformed, usedIndices } = transformCitationPatterns(text, citations);
  const usedCitations = citations.filter((c) => usedIndices.has(c.index));

  return (
    <CitationProvider citations={citationMap}>
      <StreamdownText text={transformed} isStreaming={false} />
      {usedCitations.length > 0 && <SourceCitations citations={usedCitations} />}
    </CitationProvider>
  );
}
