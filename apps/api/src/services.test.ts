import { describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

/** Helper: create a named mock class that stores constructor args. */
function mockClass(name: string) {
  const cls = class {};
  Object.defineProperty(cls, 'name', { value: name });
  return cls;
}

vi.mock('@mastra/rag', () => ({
  rerankWithScorer: vi.fn(),
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: vi.fn(() => ({})),
  createRerankerScorer: vi.fn(() => ({
    getMetrics: vi.fn(),
  })),
  RAG_RERANK_CANDIDATES: 10,
  RAG_RERANK_CANDIDATES_EXPANDED: 20,
  RAG_RERANK_MIN_SCORE: 0.5,
  RAG_RERANK_WEIGHTS: { semantic: 0.5, keyword: 0.5 },
  RAG_VECTOR_MIN_SCORE: 0.3,
}));

vi.mock('@typhoon/config', () => ({
  isScoringEnabled: true,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  DrizzleDatasetsStorage: mockClass('DrizzleDatasetsStorage'),
  DrizzleExperimentsStorage: mockClass('DrizzleExperimentsStorage'),
  DrizzleScorerDefinitionsStorage: mockClass('DrizzleScorerDefinitionsStorage'),
  PgVector: mockClass('PgVector'),
}));

vi.mock('@typhoon/db/repos', () => ({
  DashboardRepo: mockClass('DashboardRepo'),
  DocumentRepo: mockClass('DocumentRepo'),
  FailedJobRepo: mockClass('FailedJobRepo'),
  FeedbackRepo: mockClass('FeedbackRepo'),
  MessageRepo: mockClass('MessageRepo'),
  MetadataRepo: mockClass('MetadataRepo'),
  ReviewRepo: mockClass('ReviewRepo'),
  ScoreRepo: mockClass('ScoreRepo'),
  ScorerRepo: mockClass('ScorerRepo'),
  SyncJobRepo: mockClass('SyncJobRepo'),
  SyncTargetRepo: mockClass('SyncTargetRepo'),
  ThreadRepo: mockClass('ThreadRepo'),
  TraceRepo: mockClass('TraceRepo'),
}));

vi.mock('@typhoon/services', () => ({
  ChatService: mockClass('ChatService'),
  DashboardService: mockClass('DashboardService'),
  DatasetService: mockClass('DatasetService'),
  DocumentService: mockClass('DocumentService'),
  ExperimentService: mockClass('ExperimentService'),
  FeedbackService: mockClass('FeedbackService'),
  MetadataService: mockClass('MetadataService'),
  QueueService: mockClass('QueueService'),
  ReviewService: mockClass('ReviewService'),
  ScorerService: mockClass('ScorerService'),
  ScoringService: mockClass('ScoringService'),
  SearchService: mockClass('SearchService'),
  SyncTargetService: mockClass('SyncTargetService'),
  ThreadService: mockClass('ThreadService'),
  TraceService: mockClass('TraceService'),
}));

vi.mock('@typhoon/telemetry', () => ({
  getTracer: vi.fn(() => ({})),
}));

vi.mock('ai', () => ({
  embed: vi.fn(async () => ({ embedding: [0.1] })),
}));

vi.mock('./infra/db', () => ({
  db: {},
  sql: {},
}));

vi.mock('./infra/queue', () => ({
  getAllQueues: vi.fn(() => new Map()),
  getQueue: vi.fn(() => ({})),
  getSyncQueue: vi.fn(() => ({})),
}));

import {
  getChatService,
  getDashboardService,
  getDatasetService,
  getDocumentService,
  getExperimentService,
  getFeedbackService,
  getMetadataService,
  getQueueService,
  getReviewService,
  getScorerService,
  getScoringService,
  getSearchService,
  getSyncTargetService,
  getThreadService,
  getTraceService,
} from './services';

// ── Tests ─────────────────────────────────────────────────────────

describe('services composition root', () => {
  it('getDocumentService returns a DocumentService instance', () => {
    const svc = getDocumentService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('DocumentService');
  });

  it('getDocumentService returns the same cached instance on subsequent calls', () => {
    const a = getDocumentService();
    const b = getDocumentService();
    expect(a).toBe(b);
  });

  it('getFeedbackService returns a FeedbackService instance', () => {
    const svc = getFeedbackService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('FeedbackService');
  });

  it('getFeedbackService returns the same cached instance', () => {
    expect(getFeedbackService()).toBe(getFeedbackService());
  });

  it('getMetadataService returns a MetadataService instance', () => {
    const svc = getMetadataService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('MetadataService');
  });

  it('getMetadataService returns the same cached instance', () => {
    expect(getMetadataService()).toBe(getMetadataService());
  });

  it('getSyncTargetService returns a SyncTargetService instance', () => {
    const svc = getSyncTargetService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('SyncTargetService');
  });

  it('getSyncTargetService returns the same cached instance', () => {
    expect(getSyncTargetService()).toBe(getSyncTargetService());
  });

  it('getReviewService returns a ReviewService instance', () => {
    const svc = getReviewService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ReviewService');
  });

  it('getReviewService returns the same cached instance', () => {
    expect(getReviewService()).toBe(getReviewService());
  });

  it('getScoringService returns a ScoringService instance', () => {
    const svc = getScoringService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ScoringService');
  });

  it('getScoringService returns the same cached instance', () => {
    expect(getScoringService()).toBe(getScoringService());
  });

  it('getThreadService returns a ThreadService instance', () => {
    const svc = getThreadService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ThreadService');
  });

  it('getThreadService returns the same cached instance', () => {
    expect(getThreadService()).toBe(getThreadService());
  });

  it('getScorerService returns a ScorerService instance', () => {
    const svc = getScorerService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ScorerService');
  });

  it('getScorerService returns the same cached instance', () => {
    expect(getScorerService()).toBe(getScorerService());
  });

  it('getDatasetService returns a DatasetService instance', () => {
    const svc = getDatasetService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('DatasetService');
  });

  it('getDatasetService returns the same cached instance', () => {
    expect(getDatasetService()).toBe(getDatasetService());
  });

  it('getExperimentService returns an ExperimentService instance', () => {
    const svc = getExperimentService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ExperimentService');
  });

  it('getExperimentService returns the same cached instance', () => {
    expect(getExperimentService()).toBe(getExperimentService());
  });

  it('getDashboardService returns a DashboardService instance', () => {
    const svc = getDashboardService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('DashboardService');
  });

  it('getDashboardService returns the same cached instance', () => {
    expect(getDashboardService()).toBe(getDashboardService());
  });

  it('getTraceService returns a TraceService instance', () => {
    const svc = getTraceService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('TraceService');
  });

  it('getTraceService returns the same cached instance', () => {
    expect(getTraceService()).toBe(getTraceService());
  });

  it('getSearchService returns a SearchService instance', () => {
    const svc = getSearchService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('SearchService');
  });

  it('getSearchService returns the same cached instance', () => {
    expect(getSearchService()).toBe(getSearchService());
  });

  it('getChatService returns a ChatService instance', () => {
    const svc = getChatService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('ChatService');
  });

  it('getChatService returns the same cached instance', () => {
    expect(getChatService()).toBe(getChatService());
  });

  it('getQueueService returns a QueueService instance', () => {
    const svc = getQueueService();
    expect(svc).toBeDefined();
    expect(svc.constructor.name).toBe('QueueService');
  });

  it('getQueueService returns the same cached instance', () => {
    expect(getQueueService()).toBe(getQueueService());
  });
});
