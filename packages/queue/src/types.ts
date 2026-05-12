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

/** Data for a single scorer execution (child job on scoring-run queue). */
export interface ScoringRunJobData {
  /** Scorer name — used as the score's scorer_id. */
  scorerName: string;
  /** Full scorer definition, serialized for self-contained execution. */
  scorerDefinition: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    model: Record<string, unknown> | null;
    instructions: string | null;
    scoreRange: { min: number; max: number; step?: number } | null;
    presetConfig: Record<string, unknown> | null;
    defaultSampling: Record<string, unknown> | null;
  };
  /** User question to score against. */
  userQuestion: string;
  /** Agent response text. */
  responseText: string;
  /** Retrieved context chunks for context-dependent scorers. */
  context: string[];
  /** Optional persistence metadata — set by reviews for immediate score saving. */
  persist?: {
    messageId: string;
    threadId: string;
    agentId: string;
    traceId: string | null;
  };
}

/** Data for the score-aggregate parent job (reviews queue). */
export interface ScoringAggregateJobData {
  messageId: string;
  threadId: string;
  totalScorers: number;
  skippedScorers: number;
}

/** Data for experiment item processing (experiments queue). */
export interface ExperimentItemJobData {
  experimentId: string;
  itemId: string;
  input: Record<string, unknown>;
  groundTruth?: Record<string, unknown> | null;
  /** Multi-step tracking: 1 = call agent, 2 = collect scores. */
  step: number;
  /** Set in step 1, available in step 2. */
  responseText?: string;
  /** Retrieval scorers skipped due to missing context, passed from step 1 to step 2. */
  contextSkippedScorerNames?: string[];
}

/** Data for experiment completion (experiments queue). */
export interface ExperimentCompleteJobData {
  experimentId: string;
  totalItems: number;
}
