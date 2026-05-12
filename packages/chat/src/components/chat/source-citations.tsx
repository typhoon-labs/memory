import type { CitationData } from '@typhoon/ui';
import { ChevronDownIcon, FileTextIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

export function SourceCitations({
  citations,
  onDocumentOpen,
}: {
  citations: CitationData[];
  onDocumentOpen?: (
    documentId: string,
    options?: { startIndex?: number; chunkText?: string; chunks?: Array<{ startIndex?: number; chunkText?: string }> },
  ) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-border text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
      >
        <FileTextIcon className="size-3" />
        <span>
          {citations.length} source{citations.length !== 1 ? 's' : ''}
        </span>
        <ChevronDownIcon className={cn('ml-auto size-3 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="border-t border-border px-1 py-1">
          {citations.map((c) => (
            <SourceRow key={c.documentId ?? c.title} citation={c} onDocumentOpen={onDocumentOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceRow({
  citation,
  onDocumentOpen,
}: {
  citation: CitationData;
  onDocumentOpen?: (
    documentId: string,
    options?: { startIndex?: number; chunkText?: string; chunks?: Array<{ startIndex?: number; chunkText?: string }> },
  ) => void;
}) {
  const displayNum = (citation.displayIndex ?? String(citation.index)).split('.')[0];
  const citationCount = citation.children?.length ?? 1;
  const isMultiChunk = !!citation.children?.length;
  const sourceKey = citation.source;

  const handleClick = () => {
    if (!citation.documentId || !onDocumentOpen) return;
    if (isMultiChunk) {
      onDocumentOpen(citation.documentId, {
        chunks: citation.children?.map((c) => ({
          startIndex: c.startIndex,
          chunkText: c.chunkText,
        })),
      });
    } else {
      onDocumentOpen(citation.documentId, {
        startIndex: citation.startIndex,
        chunkText: citation.chunkText,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!citation.documentId || !onDocumentOpen}
      className="flex w-full items-baseline gap-2 rounded px-1.5 py-1.5 text-left hover:bg-muted disabled:pointer-events-none"
    >
      <span className="shrink-0 text-xs text-primary/70">{displayNum}.</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium text-foreground">{citation.title ?? sourceKey}</span>
          <span className="ml-auto shrink-0 text-2xs text-muted-foreground/60">
            {citationCount} citation{citationCount !== 1 ? 's' : ''}
          </span>
        </div>
        {(citation.syncSourceName || sourceKey) && (
          <div className="flex items-center gap-1 text-2xs text-muted-foreground">
            {citation.syncSourceName && <span>{citation.syncSourceName}</span>}
            {citation.syncSourceName && sourceKey && <span>·</span>}
            {sourceKey && <span className="min-w-0 truncate font-mono">{sourceKey}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
