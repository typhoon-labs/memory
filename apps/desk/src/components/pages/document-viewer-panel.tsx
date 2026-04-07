import { useQuery } from '@tanstack/react-query';
import { Badge, DocumentContentViewer, ScrollArea, Skeleton } from '@typhoon/ui';
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, DownloadIcon, FileTextIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DocumentChunk {
  text: string;
  startIndex: number | null;
}

interface DocumentMeta {
  id: string;
  title: string | null;
  description: string | null;
  sourceKey: string;
  mimeType: string | null;
  chunkCount: number;
  fileSize: number | null;
}

interface DocumentContentResponse {
  document: DocumentMeta;
  chunks: DocumentChunk[];
}

// ── Match navigator ─────────────────────────────────────────────

function useMatchNavigator(contentRef: React.RefObject<HTMLDivElement | null>, dataReady: boolean) {
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const getMatches = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(contentRef.current.querySelectorAll('mark.search-match'));
  }, [contentRef]);

  useEffect(() => {
    if (!dataReady) return;
    const timer = setTimeout(() => {
      const marks = getMatches();
      setMatchCount(marks.length);
      setActiveIndex(marks.length > 0 ? 0 : -1);
    }, 100);
    return () => clearTimeout(timer);
  }, [dataReady, getMatches]);

  useEffect(() => {
    const marks = getMatches();
    for (const mark of marks) {
      mark.classList.remove('ring-1', 'ring-primary/40', 'bg-primary/20');
    }
    if (activeIndex >= 0 && activeIndex < marks.length) {
      const active = marks[activeIndex];
      if (active) {
        active.classList.add('ring-1', 'ring-primary/40', 'bg-primary/20');
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  return { matchCount, activeIndex, goNext, goPrev };
}

// ── Main component ──────────────────────────────────────────────

export function DocumentViewerPanel({
  documentId,
  searchTerms,
  onClose,
}: {
  documentId: string;
  searchTerms: string[];
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<DocumentContentResponse>({
    queryKey: ['document-content', documentId],
    queryFn: () =>
      fetch(`/api/v1/documents/${documentId}/chunks`, { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('Failed to load document');
        return r.json();
      }),
  });

  const doc = data?.document;
  const chunks = data?.chunks ?? [];

  // Fetch original parsed content from source for high-fidelity rendering
  const { data: parsedData } = useQuery<{ text: string }>({
    queryKey: ['document-parsed', documentId],
    queryFn: () =>
      fetch(`/api/v1/documents/${documentId}/parsed-content`, { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('Failed to load parsed content');
        return r.json();
      }),
  });

  const fullText = useMemo(() => {
    if (parsedData?.text) return parsedData.text;
    return chunks.map((c) => c.text).join('\n\n');
  }, [chunks, parsedData]);

  const { matchCount, activeIndex, goNext, goPrev } = useMatchNavigator(contentRef, !!data && searchTerms.length > 0);

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
          </div>
        )}
      </div>

      {/* Match navigator */}
      {searchTerms.length > 0 && matchCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
          <button
            type="button"
            onClick={goPrev}
            className="rounded p-0.5 transition-colors hover:bg-muted/50"
            title="Previous match (Shift+F3)"
          >
            <ChevronUpIcon className="size-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded p-0.5 transition-colors hover:bg-muted/50"
            title="Next match (F3)"
          >
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs text-muted-foreground">
            Match {activeIndex + 1} of {matchCount}
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
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div ref={contentRef} className="p-4 text-sm leading-relaxed">
            <DocumentContentViewer text={fullText} mimeType={doc?.mimeType ?? null} searchTerms={searchTerms} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
