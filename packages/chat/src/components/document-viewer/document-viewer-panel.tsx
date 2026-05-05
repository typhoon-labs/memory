import { useQuery } from '@tanstack/react-query';
import { Badge, Button, DocumentContentViewer, ScrollArea, Skeleton } from '@typhoon/ui';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type DocumentContentResponse, documentContentQuery, documentParsedQuery } from './document-queries';

type DocumentChunk = DocumentContentResponse['chunks'][number];

/** Scroll an element into view within its nearest Radix ScrollArea viewport,
 *  avoiding the native scrollIntoView which can scroll hidden ancestors.
 *  Falls back to native scrollIntoView when no Radix viewport is found. */
function scrollInViewport(el: Element, block: 'center' | 'start' = 'center') {
  const viewport = el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  if (viewport) {
    const elRect = el.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const offset = block === 'center' ? viewport.clientHeight / 2 - el.clientHeight / 2 : 80;
    viewport.scrollTo({
      top: viewport.scrollTop + (elRect.top - vpRect.top) - offset,
      behavior: 'smooth',
    });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block });
  }
}

interface NavigatorState {
  matchCount: number;
  activeIndex: number;
  goNext: () => void;
  goPrev: () => void;
}

// ── Keyword match navigator ─────────────────────────────────────

/**
 * Detect `<mark class="search-match">` elements in the rendered content
 * and provide prev/next navigation. Re-detects when `hasParsedContent` changes
 * (e.g. parsed content replaces chunk text).
 */
function useKeywordNavigator(
  contentRef: React.RefObject<HTMLDivElement | null>,
  dataReady: boolean,
  hasParsedContent: boolean,
): NavigatorState {
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const getMatches = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(contentRef.current.querySelectorAll('mark.search-match'));
  }, [contentRef]);

  // Detect marks via MutationObserver — re-runs when hasParsedContent changes
  // (e.g. parsed content replaces chunk text)
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasParsedContent is an intentional trigger to re-detect highlights when content swaps
  useEffect(() => {
    if (!dataReady) return;
    const check = () => {
      const marks = getMatches();
      if (marks.length > 0) {
        setMatchCount(marks.length);
        setActiveIndex(0);
        return true;
      }
      return false;
    };
    if (check()) return;
    if (!contentRef.current) return;
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(contentRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [dataReady, getMatches, contentRef, hasParsedContent]);

  // Highlight active match and scroll
  useEffect(() => {
    const marks = getMatches();
    for (const mark of marks) {
      mark.classList.remove('ring-2', 'ring-yellow-500/70', 'bg-yellow-200/80', 'dark:bg-yellow-500/40');
    }
    if (activeIndex >= 0 && activeIndex < marks.length) {
      const active = marks[activeIndex];
      if (active) {
        active.classList.add('ring-2', 'ring-yellow-500/70', 'bg-yellow-200/80', 'dark:bg-yellow-500/40');
        scrollInViewport(active, 'center');
      }
    }
  }, [activeIndex, getMatches]);

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  return { matchCount, activeIndex, goNext, goPrev };
}

// ── Chunk navigator ─────────────────────────────────────────────

const BLOCK_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'BLOCKQUOTE']);

/** Resolve a single target (startIndex or chunkText) to searchable text lines. */
function resolveChunkLines(
  docChunks: DocumentChunk[],
  startIndex: number | undefined,
  chunkText: string | undefined,
): string[] {
  if (startIndex == null && !chunkText) return [];

  let chunk: DocumentChunk | undefined;
  if (startIndex != null && docChunks.length > 0) {
    chunk = docChunks.find((c) => c.startIndex != null && c.startIndex === startIndex);
    if (!chunk) {
      let closest: DocumentChunk | undefined;
      let minDist = Number.POSITIVE_INFINITY;
      for (const c of docChunks) {
        if (c.startIndex == null) continue;
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
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|/g, ' ')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 8);
}

/**
 * Match DOM blocks to citation chunk text and provide prev/next navigation.
 * Re-detects when `hasParsedContent` changes (e.g. parsed content replaces chunk text).
 */
function useChunkNavigator(
  contentRef: React.RefObject<HTMLDivElement | null>,
  chunks: DocumentChunk[],
  targets: Array<{ startIndex?: number; chunkText?: string }>,
  dataReady: boolean,
  hasParsedContent: boolean,
): NavigatorState {
  const [matchCount, setMatchCount] = useState(0);
  // Start at -1 so setActiveIndex(0) in detection effect triggers highlight effect
  const [activeIndex, setActiveIndex] = useState(-1);
  // Incremented each time blocks are (re-)detected so Effect 2 re-applies highlights
  // even when activeIndex hasn't changed (e.g. parsed content replaces chunk DOM).
  const [detectGeneration, setDetectGeneration] = useState(0);

  // Resolve chunk lines from all targets (memoized)
  const chunkLines = useMemo(() => {
    const allLines: string[] = [];
    for (const target of targets) {
      const lines = resolveChunkLines(chunks, target.startIndex, target.chunkText);
      for (const line of lines) {
        if (!allLines.includes(line)) allLines.push(line);
      }
    }
    return allLines;
  }, [chunks, targets]);

  // Walk the DOM fresh each call to find blocks matching chunk lines (no caching —
  // React may replace DOM nodes between calls)
  const getChunkBlocks = useCallback((): HTMLElement[] => {
    const container = contentRef.current;
    if (!container || chunkLines.length === 0) return [];

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const blocks: HTMLElement[] = [];
    const seen = new Set<Element>();

    // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker iteration
    for (let node: Node | null; (node = walker.nextNode()); ) {
      const text = node.textContent?.trim();
      if (!text || text.length < 5) continue;
      for (const line of chunkLines) {
        const isMatch =
          (text.length >= 8 && line.includes(text)) || (line.length >= 15 && text.includes(line.slice(0, 40)));
        if (isMatch) {
          let el = node.parentElement;
          while (el && el !== container && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement;
          if (el && el !== container && !seen.has(el)) {
            seen.add(el);
            blocks.push(el as HTMLElement);
          }
          break;
        }
      }
    }

    return blocks;
  }, [contentRef, chunkLines]);

  // Effect 1: Detect chunk blocks — re-runs when hasParsedContent changes
  // (e.g. parsed content replaces chunk text)
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasParsedContent is an intentional trigger to re-detect highlights when content swaps
  useEffect(() => {
    if (!dataReady) return;
    const check = () => {
      const blocks = getChunkBlocks();
      if (blocks.length > 0) {
        setMatchCount(blocks.length);
        setActiveIndex(0);
        setDetectGeneration((g) => g + 1);
        return true;
      }
      return false;
    };
    if (check()) return;
    if (!contentRef.current) return;
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(contentRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [dataReady, getChunkBlocks, contentRef, hasParsedContent]);

  // Effect 2: Highlight active block and scroll (mirrors keyword highlight effect).
  // detectGeneration ensures this re-runs even when activeIndex stays 0 (e.g. parsed
  // content replaces chunk DOM and blocks are re-detected at the same index).
  // biome-ignore lint/correctness/useExhaustiveDependencies: detectGeneration is an intentional trigger to re-apply highlights after DOM swap
  useEffect(() => {
    const blocks = getChunkBlocks();
    for (const el of blocks) {
      el.classList.remove('chunk-highlight', 'chunk-highlight-active');
    }
    if (blocks.length > 0) {
      for (let i = 0; i < blocks.length; i++) {
        blocks[i].classList.add(i === activeIndex ? 'chunk-highlight-active' : 'chunk-highlight');
      }
      if (activeIndex >= 0 && activeIndex < blocks.length) {
        scrollInViewport(blocks[activeIndex], 'center');
      }
    }
  }, [activeIndex, getChunkBlocks, detectGeneration]);

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  return { matchCount, activeIndex, goNext, goPrev };
}

// ── Main component ──────────────────────────────────────────────

/**
 * Split-panel document viewer with progressive content loading.
 * Shows chunk text immediately from DB, then upgrades to full parsed
 * content from S3. Supports keyword search highlighting and citation
 * chunk navigation with prev/next controls.
 */
export function DocumentViewerPanel({
  documentId,
  searchTerms,
  startIndex,
  chunkText,
  citationChunks,
  onClose,
}: {
  documentId: string;
  searchTerms: string[];
  startIndex?: number;
  chunkText?: string;
  citationChunks?: Array<{ startIndex?: number; chunkText?: string }>;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError: chunksError,
    refetch: refetchChunks,
  } = useQuery<DocumentContentResponse>(documentContentQuery(documentId));

  const doc = data?.document;
  const chunks = data?.chunks ?? [];

  // Fetch original parsed content from source for high-fidelity rendering
  const {
    data: parsedData,
    isLoading: parsedLoading,
    isError: parsedError,
    refetch: refetchParsed,
  } = useQuery(documentParsedQuery(documentId));

  const fullText = useMemo(() => {
    if (parsedData?.text) return parsedData.text;
    return chunks.map((c) => c.text).join('\n\n');
  }, [chunks, parsedData]);

  // Tracks whether parsed content has arrived — used as a dependency in
  // navigator hooks so highlights re-detect when the DOM swaps from chunk
  // text to full parsed content.
  const hasParsedContent = !!parsedData?.text;

  // Mode: chunk (from citations) or keyword (from search)
  const isChunkMode = startIndex != null || chunkText != null || (citationChunks != null && citationChunks.length > 0);
  // Build targets array — either multi-chunk or single target
  const chunkTargets = useMemo(() => {
    if (citationChunks && citationChunks.length > 0) return citationChunks;
    if (startIndex != null || chunkText != null) return [{ startIndex, chunkText }];
    return [];
  }, [citationChunks, startIndex, chunkText]);
  // Enable highlighting as soon as chunks are ready — don't wait for parsed content.
  // The hasParsedContent dependency in the navigator hooks ensures highlights re-detect
  // when parsed content arrives and replaces the chunk-based DOM.
  const contentReady = !!data;
  const keyword = useKeywordNavigator(
    contentRef,
    contentReady && !isChunkMode && searchTerms.length > 0,
    hasParsedContent,
  );
  const chunk = useChunkNavigator(contentRef, chunks, chunkTargets, contentReady && isChunkMode, hasParsedContent);
  const nav = isChunkMode ? chunk : keyword;
  const navLabel = isChunkMode ? 'Chunk' : 'Match';

  // Scroll to anchor target within the document viewer ScrollArea
  const handleAnchorClick = useCallback((id: string) => {
    const target = contentRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target) scrollInViewport(target, 'start');
  }, []);

  // Unified keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        if (e.shiftKey) nav.goPrev();
        else nav.goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nav.goNext, nav.goPrev]);

  const handleDownload = () => {
    window.open(`/api/v1/documents/${documentId}/download`, '_blank');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onClose}
                className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              >
                <ArrowLeftIcon className="size-3" />
                Back to results
              </button>
              <h2 className="flex items-center gap-2 break-all text-sm font-semibold">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                {doc?.title ?? doc?.sourceKey ?? 'Document'}
              </h2>
              {doc?.description && (
                <p className="mt-1 pl-6 text-xs leading-relaxed text-muted-foreground">{doc.description}</p>
              )}
              {doc?.sourceKey && (
                <p className="mt-0.5 truncate pl-6 font-mono text-xs text-muted-foreground">{doc.sourceKey}</p>
              )}
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!isLoading && (
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-md p-1 transition-colors hover:bg-muted/50"
                title="Download original"
              >
                <DownloadIcon className="size-4 text-muted-foreground" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="hidden rounded-md p-1 transition-colors hover:bg-muted/50 lg:block"
            >
              <XIcon className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {!isLoading && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {doc?.mimeType && (
              <Badge variant="secondary" className="text-2xs">
                {doc.mimeType}
              </Badge>
            )}
            <Badge variant="outline" className="text-2xs">
              {chunks.length} chunks
            </Badge>
            {parsedLoading && (
              <Badge variant="outline" className="text-2xs animate-pulse gap-1">
                <Loader2Icon className="size-2.5 animate-spin" />
                Loading full content...
              </Badge>
            )}
            {parsedError && (
              <button type="button" onClick={() => refetchParsed()}>
                <Badge variant="outline" className="text-2xs gap-1 cursor-pointer text-amber-600 dark:text-amber-400">
                  <AlertCircleIcon className="size-2.5" />
                  Full content unavailable — retry
                </Badge>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigator bar — works for both chunk and keyword modes */}
      {nav.matchCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
          <button
            type="button"
            onClick={nav.goPrev}
            className="rounded p-0.5 transition-colors hover:bg-muted/50"
            title="Previous (Shift+F3)"
          >
            <ChevronUpIcon className="size-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={nav.goNext}
            className="rounded p-0.5 transition-colors hover:bg-muted/50"
            title="Next (F3)"
          >
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs text-muted-foreground">
            {navLabel} {Math.max(0, nav.activeIndex) + 1} of {nav.matchCount}
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : chunksError ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircleIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Failed to load document content</p>
          <Button variant="outline" size="sm" onClick={() => refetchChunks()}>
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            Retry
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div ref={contentRef} className="min-w-0 p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
            <DocumentContentViewer
              text={fullText}
              mimeType={doc?.mimeType ?? null}
              searchTerms={isChunkMode ? [] : searchTerms}
              onAnchorClick={handleAnchorClick}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
