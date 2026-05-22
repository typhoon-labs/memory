import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { DocumentViewerPanel, documentContentQuery, documentParsedQuery } from '@typhoon/chat';
import {
  apiFetch,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  cn,
  EmptyState,
  LoadingSpinner,
  PageHeader,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@typhoon/ui';
import { DatabaseIcon, FileTextIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { detailTitle, usePageTitle } from '../../hooks/use-page-title';

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

const GROUPS_PER_PAGE = 10;

// ── Utilities ───────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replaceAll(/^#{1,6}\s+/gm, '')
    .replaceAll(/\*\*(.+?)\*\*/g, '$1')
    .replaceAll(/\*(.+?)\*/g, '$1')
    .replaceAll(/`(.+?)`/g, '$1')
    .replaceAll(/^\s*[-*+]\s+/gm, '')
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function scoreVariant(score: number): 'success' | 'info' | 'warning' {
  if (score >= 0.8) return 'success';
  if (score >= 0.6) return 'info';
  return 'warning';
}

// ── Component ───────────────────────────────────────────────────

export function SearchPage() {
  const navigate = useNavigate();
  const { q, expanded, doc, chunk } = useSearch({ strict: false }) as {
    q: string | undefined;
    expanded: true | undefined;
    doc: string | undefined;
    chunk: number | undefined;
  };

  const expandedMode = expanded ?? false;
  const selectedDocId = doc ?? null;
  const selectedChunkIdx = chunk ?? null;

  usePageTitle(detailTitle('Search', q));

  const [query, setQuery] = useState(q ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PER_PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const prefetchDocument = useCallback(
    (docId: string) => {
      queryClient.prefetchQuery(documentContentQuery(docId));
      queryClient.prefetchQuery(documentParsedQuery(docId));
    },
    [queryClient],
  );

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
    queryFn: () => apiFetch<DocumentRecord[]>('/api/v1/documents'),
    staleTime: 60_000,
  });

  const { data: syncTargetsData } = useQuery<SyncTargetRecord[]>({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch<SyncTargetRecord[]>('/api/v1/sync-targets'),
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

  const executeSearch = useCallback(async (searchQuery: string, isExpanded: boolean) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setVisibleGroupCount(GROUPS_PER_PAGE);
    try {
      const data = await apiFetch<{ results?: SearchResult[] }>('/api/v1/search/hybrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          ...(isExpanded && { expanded: true }),
        }),
      });
      setResults(data.results ?? []);
      setHasSearched(true);
    } catch {
      console.error('Search failed');
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate({
      search: ((prev: Record<string, unknown>) => ({ ...prev, q: trimmed, doc: undefined, chunk: undefined })) as never,
    });
    executeSearch(trimmed, expandedMode);
  };

  const handleToggleExpanded = () => {
    const next = !expandedMode;
    navigate({
      search: ((prev: Record<string, unknown>) => ({ ...prev, expanded: next || undefined })) as never,
      replace: true,
    });
    if (hasSearched) executeSearch(query.trim(), next);
  };

  // Auto-execute search when landing with a q param (shared link)
  useEffect(() => {
    if (q && !hasSearched && !isSearching) {
      executeSearch(q, expandedMode);
    }
  }, [q, expandedMode, hasSearched, isSearching, executeSearch]);

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
    return Array.from(map.values()).toSorted((a, b) => b.bestScore - a.bestScore);
  }, [results, docMap, syncTargetMap]);

  // In expanded mode, show individual chunks; in default mode, show document groups
  const displayItems = expandedMode ? results : grouped;
  const visibleItems = displayItems.slice(0, visibleGroupCount * (expandedMode ? 3 : 1));
  const hasMore = visibleItems.length < displayItems.length;

  // ── Infinite scroll ───────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleGroupCount((prev) => prev + GROUPS_PER_PAGE);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  // ── Results list ──────────────────────────────────────────────

  const resultsList = (
    <div className="overflow-y-auto p-4 sm:p-6">
      <div className={selectedDocId ? '' : 'mx-auto max-w-5xl'}>
        <PageHeader title="Search" description="Search across all knowledge base documents" />

        <div className="mt-4 space-y-3">
          <form
            onSubmit={handleSearch}
            className="border-border bg-card flex items-center gap-2 rounded-xl border p-2.5 shadow-lg shadow-black/5"
          >
            <SearchIcon className="text-muted-foreground size-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              aria-label="Search documents"
              className="text-foreground placeholder:text-muted-foreground/65 min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="bg-primary text-primary-foreground flex size-[30px] shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {isSearching ? <LoadingSpinner size="sm" /> : <SearchIcon className="size-3.5" />}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={expandedMode ? 'default' : 'outline'}
                    size="xs"
                    onClick={handleToggleExpanded}
                  >
                    <SparklesIcon className="size-3" />
                    Expanded
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                  Deep search showing all matching passages (slower)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {hasSearched && !isSearching && displayItems.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {expandedMode
                  ? `${results.length} passage${results.length !== 1 ? 's' : ''} found`
                  : `${grouped.length} document${grouped.length !== 1 ? 's' : ''} found`}
              </span>
            )}
          </div>
        </div>

        {isSearching && (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        )}

        {!isSearching && (
          <div className="mt-3 space-y-2">
            {expandedMode
              ? (visibleItems as SearchResult[]).map((result, idx) => {
                  const docId = result.metadata.documentId ?? '';
                  const isActive = selectedChunkIdx === idx;
                  const doc = docMap.get(docId);
                  const stId = result.metadata.syncTargetId ?? doc?.syncTargetId ?? '';
                  const st = syncTargetMap.get(stId);
                  return (
                    <Card
                      key={`${docId}-${result.metadata.startIndex ?? idx}`}
                      className={cn(
                        'cursor-pointer transition-shadow hover:shadow-md',
                        isActive && 'ring-primary/40 ring-2',
                      )}
                      onClick={() => {
                        navigate({
                          search: ((prev: Record<string, unknown>) => ({
                            ...prev,
                            doc: docId,
                            chunk: idx,
                          })) as never,
                          replace: true,
                        });
                      }}
                      onMouseEnter={() => docId && prefetchDocument(docId)}
                    >
                      <CardHeader className="pb-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-2">
                            <FileTextIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                            <span className="text-sm font-medium break-words">
                              {stripMarkdown(result.metadata.title ?? result.metadata.source ?? 'Unknown')}
                            </span>
                          </div>
                          <Badge variant={scoreVariant(result.score)} className="text-2xs shrink-0 tabular-nums">
                            {(result.score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-muted-foreground line-clamp-3 pl-[22px] text-xs leading-relaxed">
                          {stripMarkdown(result.text)}
                        </p>
                        <div className="text-2xs text-muted-foreground mt-1.5 flex min-w-0 items-center gap-1.5 pl-[22px]">
                          {st?.name && (
                            <>
                              <DatabaseIcon className="size-3 shrink-0" />
                              <span className="shrink-0">{st.name}</span>
                              <span className="shrink-0">&middot;</span>
                            </>
                          )}
                          {result.metadata.source && (
                            <span className="min-w-0 truncate font-mono">{result.metadata.source}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              : (visibleItems as GroupedResult[]).map((group) => {
                  const isActive = selectedDocId === group.documentId;
                  return (
                    <Card
                      key={group.documentId}
                      className={cn(
                        'cursor-pointer transition-shadow hover:shadow-md',
                        isActive && 'ring-primary/40 ring-2',
                      )}
                      onClick={() =>
                        navigate({
                          search: ((prev: Record<string, unknown>) => ({
                            ...prev,
                            doc: group.documentId,
                            chunk: undefined,
                          })) as never,
                          replace: true,
                        })
                      }
                      onMouseEnter={() => prefetchDocument(group.documentId)}
                    >
                      <CardHeader className="pb-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-2">
                            <FileTextIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                            <span className="text-sm font-medium break-words">{stripMarkdown(group.title)}</span>
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
                          <p className="text-muted-foreground line-clamp-2 pl-[22px] text-xs leading-relaxed">
                            {group.description}
                          </p>
                        )}
                        <div className="text-2xs text-muted-foreground mt-1.5 flex min-w-0 items-center gap-1.5 pl-[22px]">
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

            {hasSearched && !hasMore && displayItems.length > 0 && <div className="h-4" />}
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
          key={
            expandedMode && selectedChunkIdx !== null && selectedChunkIdx !== undefined
              ? `${selectedDocId}-${selectedChunkIdx}`
              : selectedDocId
          }
          documentId={selectedDocId}
          searchTerms={searchTerms}
          startIndex={
            expandedMode && selectedChunkIdx !== null && selectedChunkIdx !== undefined
              ? (results[selectedChunkIdx]?.metadata.startIndex ?? undefined)
              : undefined
          }
          chunkText={
            expandedMode && selectedChunkIdx !== null && selectedChunkIdx !== undefined
              ? results[selectedChunkIdx]?.text
              : undefined
          }
          onClose={() => {
            navigate({
              search: ((prev: Record<string, unknown>) => ({ ...prev, doc: undefined, chunk: undefined })) as never,
              replace: true,
            });
          }}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
