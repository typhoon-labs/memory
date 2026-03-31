import { ChevronDownIcon, FileTextIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils.js';

export interface SourceCitation {
  documentTitle: string;
  section?: string;
  score?: number;
}

export function SourceCitations({ citations }: { citations: SourceCitation[] }) {
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
        <div className="space-y-1 border-t border-border px-2.5 py-1.5">
          {citations.map((c, i) => (
            <div key={`citation-${String(i)}`} className="flex items-center gap-1.5 text-muted-foreground">
              <FileTextIcon className="size-3 shrink-0" />
              <span className="truncate">
                {c.documentTitle}
                {c.section ? ` — ${c.section}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
