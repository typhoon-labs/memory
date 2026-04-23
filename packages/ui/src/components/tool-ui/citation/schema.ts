export interface CitationData {
  /** 1-based citation number */
  index: number;
  /** Document title */
  title: string;
  /** Section heading within the document */
  section?: string;
  /** Internal document UUID for linking to the document viewer */
  documentId?: string;
  /** S3 source key / filepath */
  source?: string;
  /** Excerpt from the matched chunk */
  snippet?: string;
  /** Vector similarity / relevance score (0–1) */
  score?: number;
  /** Vector store row ID — unique per chunk */
  chunkId?: string;
  /** Character offset of this chunk within the original document */
  startIndex?: number;
  /** Full chunk text (for document viewer chunk matching; not displayed) */
  chunkText?: string;
  /** Hierarchical citation label: "1", "1.1", "1.2", "2" */
  displayIndex?: string;
  /** Child citations for document-level references (e.g., [Source: 1] grouping chunks 1.1, 1.2) */
  children?: CitationData[];
  /** Display name for the sync source / document collection (derived from S3 path prefix) */
  syncSourceName?: string;
}
