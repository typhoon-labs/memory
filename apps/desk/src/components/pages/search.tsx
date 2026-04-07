import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  cn,
  EmptyState,
  Input,
  LoadingSpinner,
  PageHeader,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@typhoon/ui';
import { DatabaseIcon, FileTextIcon, SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DocumentViewerPanel } from './document-viewer-panel.js';

// ── Types ───────────────────────────────────────────────────────

interface SearchResult {
  text: string;
  score: number;
  metadata: {
    documentId?: string;
    syncTargetId?: string;
    source?: string;
    title?: string;
    startIndex?: number | null;
  };
}

interface GroupedResult {
  documentId: string;
  syncTargetId: string;
  title: string;
  description: string | null;
  source: string;
  syncTargetName: string;
  bestScore: number;
  matchCount: number;
}

interface DocumentRecord {
  id: string;
  title: string | null;
  description: string | null;
  syncTargetId: string;
}

interface SyncTargetRecord {
  id: string;
  name: string;
  sourceType: string;
}

// ── Constants ───────────────────────────────────────────────────

const INITIAL_TOP_K = 50;
const GROUPS_PER_PAGE = 10;

// ── Utilities ───────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function scoreVariant(score: number): 'success' | 'info' | 'warning' {
  if (score >= 0.8) return 'success';
  if (score >= 0.6) return 'info';
  return 'warning';
}

// ── Component ───────────────────────────────────────────────────

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PER_PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const searchTerms = useMemo(
    () =>
      query
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    [query],
  );

  // ── Enrichment lookups ────────────────────────────────────────

  const { data: documentsData } = useQuery<DocumentRecord[]>({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/v1/documents', { credentials: 'include' }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: syncTargetsData } = useQuery<SyncTargetRecord[]>({
    queryKey: ['sync-targets'],
    queryFn: () => fetch('/api/v1/sync-targets', { credentials: 'include' }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const docMap = useMemo(() => {
    const m = new Map<string, DocumentRecord>();
    for (const d of documentsData ?? []) m.set(d.id, d);
    return m;
  }, [documentsData]);

  const syncTargetMap = useMemo(() => {
    const m = new Map<string, SyncTargetRecord>();
    for (const s of syncTargetsData ?? []) m.set(s.id, s);
    return m;
  }, [syncTargetsData]);

  // ── Search handler ────────────────────────────────────────────

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setVisibleGroupCount(GROUPS_PER_PAGE);
    try {
      const res = await fetch('/api/v1/search/hybrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK: INITIAL_TOP_K }),
      });
      if (!res.ok) {
        console.error('Search failed');
        setResults([]);
        setHasSearched(true);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  // ── Grouping with enrichment ──────────────────────────────────

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedResult>();
    for (const result of results) {
      const docId = result.metadata.documentId ?? `unknown-${result.text.slice(0, 20)}`;
      const existing = map.get(docId);
      if (existing) {
        existing.matchCount++;
        if (result.score > existing.bestScore) existing.bestScore = result.score;
      } else {
        const doc = docMap.get(docId);
        const stId = result.metadata.syncTargetId ?? doc?.syncTargetId ?? '';
        const st = syncTargetMap.get(stId);
        map.set(docId, {
          documentId: docId,
          syncTargetId: stId,
          title: result.metadata.title ?? result.metadata.source ?? 'Unknown',
          description: doc?.description ?? null,
          source: result.metadata.source ?? '',
          syncTargetName: st?.name ?? '',
          bestScore: result.score,
          matchCount: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.bestScore - a.bestScore);
  }, [results, docMap, syncTargetMap]);

  const visibleGroups = grouped.slice(0, visibleGroupCount);
  const hasMore = visibleGroupCount < grouped.length;

  // ── Infinite scroll ───────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleGroupCount((prev) => Math.min(prev + GROUPS_PER_PAGE, grouped.length));
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, grouped.length]);

  // ── Results list ──────────────────────────────────────────────

  const resultsList = (
    <div className="overflow-y-auto p-4 sm:p-6">
      <div className={selectedDocId ? '' : 'mx-auto max-w-4xl'}>
        <PageHeader title="Search" description="Search across all knowledge base documents" />

        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="flex-1"
          />
          <Button type="submit" disabled={isSearching}>
            {isSearching ? <LoadingSpinner size="sm" /> : <SearchIcon className="mr-2 size-4" />}
            {isSearching ? 'Searching…' : 'Search'}
          </Button>
        </form>

        {hasSearched && !isSearching && grouped.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {grouped.length} document{grouped.length !== 1 ? 's' : ''} found
          </p>
        )}

        {isSearching && (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        )}

        {!isSearching && (
          <div className="mt-3 space-y-2">
            {visibleGroups.map((group) => {
              const isActive = selectedDocId === group.documentId;
              return (
                <Card
                  key={group.documentId}
                  className={cn(
                    'cursor-pointer transition-shadow hover:shadow-md',
                    isActive && 'ring-2 ring-primary/40',
                  )}
                  onClick={() => setSelectedDocId(group.documentId)}
                >
                  <CardHeader className="pb-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-2">
                        <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-words text-sm font-medium">{stripMarkdown(group.title)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={scoreVariant(group.bestScore)} className="text-2xs tabular-nums">
                          {(group.bestScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {group.description && (
                      <p className="line-clamp-2 pl-[22px] text-xs leading-relaxed text-muted-foreground">
                        {group.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 pl-[22px] text-2xs text-muted-foreground">
                      {group.syncTargetName && (
                        <>
                          <DatabaseIcon className="size-3 shrink-0" />
                          <span className="shrink-0">{group.syncTargetName}</span>
                          <span className="shrink-0">&middot;</span>
                        </>
                      )}
                      {group.source && <span className="min-w-0 truncate font-mono">{group.source}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            )}

            {hasSearched && !hasMore && grouped.length > 0 && <div className="h-4" />}
          </div>
        )}

        {hasSearched && results.length === 0 && !isSearching && (
          <div className="mt-6">
            <EmptyState
              icon={<SearchIcon className="size-8" />}
              title="No results found"
              description="Try adjusting your search query."
            />
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────

  if (!selectedDocId) {
    return <div className="h-full">{resultsList}</div>;
  }

  return (
    <ResizablePanelGroup orientation="horizontal">
      {/* Results panel — hidden on mobile when viewer is open */}
      <ResizablePanel defaultSize={50} minSize={20} className="hidden lg:block">
        {resultsList}
      </ResizablePanel>

      <ResizableHandle withHandle className="hidden lg:flex" />

      {/* Document viewer panel */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <DocumentViewerPanel
          key={selectedDocId}
          documentId={selectedDocId}
          searchTerms={searchTerms}
          onClose={() => setSelectedDocId(null)}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
