export interface ScanJobData {
  syncTargetId: string;
  force?: boolean;
}

export interface ProcessFileJobData {
  syncTargetId: string;
  documentId: string;
  sourceKey: string;
  sourceEtag: string;
  sourceType: string;
  sourceName?: string;
  isUpdate: boolean;
  syncJobId?: string;
}

export interface DeleteFileJobData {
  documentId: string;
  sourceKey?: string;
  sourceType?: string;
  syncTargetId?: string;
  syncJobId?: string;
}

export interface ScoringJobData {
  /** `messages.externalId` of the assistant message to score. */
  messageId: string;
  /** `threads.externalId` of the containing thread. */
  threadId: string;
  /** Agent that produced the response. */
  agentId: string;
  /** OTel traceId captured at request time, if available. */
  traceId: string | null;
}

export interface ExperimentJobData {
  experimentId: string;
}
