import { FileTextIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { CitationData } from './schema';

export interface InlineCitationChipProps {
  citation: CitationData;
  onDocumentOpen?: (
    documentId: string,
    options?: {
      startIndex?: number;
      chunkText?: string;
      chunks?: Array<{ startIndex?: number; chunkText?: string }>;
    },
  ) => void;
}

export function InlineCitationChip({ citation, onDocumentOpen }: InlineCitationChipProps) {
  const isMultiChunk = !!citation.children?.length;
  const displayNum = (citation.displayIndex ?? String(citation.index)).split('.')[0];

  const handleClick = () => {
    if (citation.documentId && onDocumentOpen) {
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
    }
  };

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-0.5',
        'rounded bg-muted px-1 py-px',
        'text-[0.65em] font-medium text-primary/80',
        'relative -top-[0.35em] align-baseline',
        'cursor-pointer outline-none motion-safe:transition-colors',
        'hover:bg-muted hover:text-primary',
        'focus-visible:ring-1 focus-visible:ring-ring',
      )}
      aria-label={`Citation ${displayNum}: ${citation.title}`}
      onClick={handleClick}
    >
      <FileTextIcon className="size-2.5 shrink-0 opacity-60" />
      {displayNum}
    </button>
  );
}
