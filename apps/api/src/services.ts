/**
 * Composition root — wires repos and services for the API server.
 * Services are lazily instantiated and cached.
 */

import { rerankWithScorer } from '@mastra/rag';
import {
  createEmbeddingModel,
  createRerankerScorer,
  RAG_RERANK_CANDIDATES,
  RAG_RERANK_CANDIDATES_EXPANDED,
  RAG_RERANK_MIN_SCORE,
  RAG_RERANK_WEIGHTS,
  RAG_VECTOR_MIN_SCORE,
} from '@typhoon/ai';
import { isScoringEnabled } from '@typhoon/config';
import {
  DrizzleDatasetsStorage,
  DrizzleExperimentsStorage,
  DrizzleScorerDefinitionsStorage,
  PgVector,
} from '@typhoon/db/drivers/pg';
import {
  DashboardRepo,
  DocumentRepo,
  FailedJobRepo,
  FeedbackRepo,
  MessageRepo,
  MetadataRepo,
  ReviewRepo,
  ScoreRepo,
  ScorerRepo,
  SyncJobRepo,
  SyncTargetRepo,
  ThreadRepo,
  TraceRepo,
} from '@typhoon/db/repos';
import {
  ChatService,
  DashboardService,
  DatasetService,
  DocumentService,
  ExperimentService,
  FeedbackService,
  MetadataService,
  QueueService,
  ReviewService,
  ScorerService,
  ScoringService,
  SearchService,
  SyncTargetService,
  ThreadService,
  TraceService,
} from '@typhoon/services';
import { getTracer } from '@typhoon/telemetry';
import { embed, type EmbeddingModel } from 'ai';

import { db, sql } from './infra/db';
import { getAllQueues, getQueue, getSyncQueue } from './infra/queue';

const dashboardRepo = new DashboardRepo(db);
const documentRepo = new DocumentRepo(db);
const failedJobRepo = new FailedJobRepo(db);
const feedbackRepo = new FeedbackRepo(db);
const messageRepo = new MessageRepo(db);
const metadataRepo = new MetadataRepo(db);
const reviewRepo = new ReviewRepo(db);
const scoreRepo = new ScoreRepo(db);
const scorerRepo = new ScorerRepo(db);
const syncJobRepo = new SyncJobRepo(db);
const syncTargetRepo = new SyncTargetRepo(db);
const threadRepo = new ThreadRepo(db);
const traceRepo = new TraceRepo(db);
const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

let _documentService: DocumentService | undefined;
export function getDocumentService() {
  if (!_documentService) {
    _documentService = new DocumentService({
      documentRepo,
      syncTargetRepo,
      metadataRepo,
      vectorStore,
      syncQueue: getSyncQueue(),
      sql,
    });
  }
  return _documentService;
}

let _feedbackService: FeedbackService | undefined;
export function getFeedbackService() {
  if (!_feedbackService) {
    _feedbackService = new FeedbackService({
      feedbackRepo,
      messageRepo,
      threadRepo,
    });
  }
  return _feedbackService;
}

let _metadataService: MetadataService | undefined;
export function getMetadataService() {
  if (!_metadataService) {
    _metadataService = new MetadataService({
      metadataRepo,
      syncTargetRepo,
      documentRepo,
    });
  }
  return _metadataService;
}

let _syncTargetService: SyncTargetService | undefined;
export function getSyncTargetService() {
  if (!_syncTargetService) {
    _syncTargetService = new SyncTargetService({
      syncTargetRepo,
      syncJobRepo,
      documentRepo,
      metadataRepo,
      vectorStore,
      syncQueue: getSyncQueue(),
      db,
      sql,
    });
  }
  return _syncTargetService;
}

let _reviewService: ReviewService | undefined;
export function getReviewService() {
  if (!_reviewService) {
    _reviewService = new ReviewService({
      reviewRepo,
      vectorStore,
    });
  }
  return _reviewService;
}

let _scoringService: ScoringService | undefined;
export function getScoringService() {
  if (!_scoringService) {
    _scoringService = new ScoringService({
      messageRepo,
      threadRepo,
      scoreRepo,
      vectorStore,
    });
  }
  return _scoringService;
}

let _threadService: ThreadService | undefined;
export function getThreadService() {
  if (!_threadService) {
    _threadService = new ThreadService({
      threadRepo,
      messageRepo,
      vectorStore,
    });
  }
  return _threadService;
}

let _scorerService: ScorerService | undefined;
export function getScorerService() {
  if (!_scorerService) {
    _scorerService = new ScorerService({
      scorerStorage: new DrizzleScorerDefinitionsStorage(db),
      scorerRepo,
    });
  }
  return _scorerService;
}

let _datasetService: DatasetService | undefined;
export function getDatasetService() {
  if (!_datasetService) {
    _datasetService = new DatasetService({
      datasetsStorage: new DrizzleDatasetsStorage(db),
    });
  }
  return _datasetService;
}

let _experimentService: ExperimentService | undefined;
export function getExperimentService() {
  if (!_experimentService) {
    _experimentService = new ExperimentService({
      experimentsStorage: new DrizzleExperimentsStorage(db),
      datasetsStorage: new DrizzleDatasetsStorage(db),
      experimentQueue: getQueue('experiments'),
    });
  }
  return _experimentService;
}

let _dashboardService: DashboardService | undefined;
export function getDashboardService() {
  if (!_dashboardService) {
    _dashboardService = new DashboardService({
      dashboardRepo,
    });
  }
  return _dashboardService;
}

let _traceService: TraceService | undefined;
export function getTraceService() {
  if (!_traceService) {
    _traceService = new TraceService({
      traceRepo,
    });
  }
  return _traceService;
}

// ── Search Service ──────────────────────────────────────────────────

const rerankerScorer = createRerankerScorer();

let _searchService: SearchService | undefined;
export function getSearchService() {
  if (!_searchService) {
    _searchService = new SearchService({
      vectorStore,
      tracer: getTracer('search'),
      createEmbedding: async (text: string) => {
        const { embedding } = await embed({ model: createEmbeddingModel() as unknown as EmbeddingModel, value: text });
        return embedding;
      },
      createReranker: (topK: number) => (results, q) =>
        rerankWithScorer({
          results,
          query: q,
          scorer: rerankerScorer,
          options: { weights: RAG_RERANK_WEIGHTS, topK },
        }),
      getRerankerMetrics: (query: string) => rerankerScorer.getMetrics(query),
      config: {
        rerankCandidates: RAG_RERANK_CANDIDATES,
        rerankCandidatesExpanded: RAG_RERANK_CANDIDATES_EXPANDED,
        rerankMinScore: RAG_RERANK_MIN_SCORE,
        vectorMinScore: RAG_VECTOR_MIN_SCORE,
      },
    });
  }
  return _searchService;
}

// ── Chat Service ────────────────────────────────────────────────────

let _chatService: ChatService | undefined;
export function getChatService() {
  if (!_chatService) {
    _chatService = new ChatService({
      isScoringEnabled,
      sampleRate: Number(process.env.SCORING_SAMPLE_RATE ?? '1.0'),
    });
  }
  return _chatService;
}

// ── Queue Service ───────────────────────────────────────────────────

let _queueService: QueueService | undefined;
export function getQueueService() {
  if (!_queueService) {
    _queueService = new QueueService({
      getAllQueues,
      getQueue,
      failedJobRepo,
    });
  }
  return _queueService;
}
