import type { CitationData } from '@typhoon/ui';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

export interface CitationContextValue {
  /** Map of 1-based citation index to its metadata. */
  citations: Map<number, CitationData>;
  /** Called when user clicks "Open document" on a citation popover. */
  onDocumentOpen?: (
    documentId: string,
    options?: {
      startIndex?: number;
      chunkText?: string;
      /** Multiple chunk positions for document-level citations */
      chunks?: Array<{ startIndex?: number; chunkText?: string }>;
    },
  ) => void;
}

const CitationCtx = createContext<CitationContextValue>({ citations: new Map() });

export function CitationProvider({
  citations,
  onDocumentOpen,
  children,
}: CitationContextValue & { children: ReactNode }) {
  return <CitationCtx.Provider value={{ citations, onDocumentOpen }}>{children}</CitationCtx.Provider>;
}

export function useCitations(): CitationContextValue {
  return useContext(CitationCtx);
}
