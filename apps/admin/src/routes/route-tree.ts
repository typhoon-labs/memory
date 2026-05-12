import { createRootRoute, createRoute } from '@tanstack/react-router';
import { AdminDashboard } from '../components/pages/dashboard';
import { DatasetCreatePage } from '../components/pages/dataset-create';
import { DatasetDetailPage } from '../components/pages/dataset-detail';
import { DatasetItemFormPage } from '../components/pages/dataset-item-form';
import { DatasetsPage } from '../components/pages/datasets';
import { AdminDocumentsPage } from '../components/pages/documents';
import { ExperimentComparePage } from '../components/pages/experiment-compare';
import { ExperimentCreatePage } from '../components/pages/experiment-create';
import { ExperimentDetailPage } from '../components/pages/experiment-detail';
import { ExperimentsPage } from '../components/pages/experiments';
import { FieldGroupDetailPage } from '../components/pages/field-group-detail';
import { AdminLoginPage } from '../components/pages/login';
import { MetadataFieldGroupsPage, MetadataTemplatesPage } from '../components/pages/metadata';
import { QueueDetailPage } from '../components/pages/queue-detail';
import { QueuesPage } from '../components/pages/queues';
import { ReviewDetailPage } from '../components/pages/review-detail';
import { ReviewsPage } from '../components/pages/reviews';
import { ScorerCreatePage } from '../components/pages/scorer-create';
import { ScorerDetailPage } from '../components/pages/scorer-detail';
import { ScorersPage } from '../components/pages/scorers';
import { SyncSourceCreatePage } from '../components/pages/sync-source-create';
import { SyncSourceDetailPage } from '../components/pages/sync-source-detail';
import { SyncSourcesPage } from '../components/pages/sync-sources';
import { MetadataTemplateDetailPage } from '../components/pages/template-detail';
import { TraceDetailPage } from '../components/pages/trace-detail';
import { TracesPage } from '../components/pages/traces';
import { AdminShell } from '../layouts/admin-shell';
import { AdminAuthGate } from './admin-auth-gate';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: AdminLoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AdminAuthGate,
});

const layoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: 'layout',
  component: AdminShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: AdminDashboard,
});

// --- Sync Sources ---

const syncSourcesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources',
  component: SyncSourcesPage,
});

// Create route BEFORE detail route to avoid $sourceId matching 'create'
const sourceCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources/create',
  component: SyncSourceCreatePage,
});

const SOURCE_TABS = ['overview', 'documents', 'sync-log'] as const;

const sourceDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources/$sourceId',
  component: SyncSourceDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      typeof search.tab === 'string' && (SOURCE_TABS as readonly string[]).includes(search.tab)
        ? (search.tab as (typeof SOURCE_TABS)[number])
        : ('overview' as const),
    path: typeof search.path === 'string' ? search.path : '',
  }),
});

// --- Documents ---

const DOC_STATUS_FILTERS = ['all', 'ready', 'errors', 'processing', 'pending'] as const;

const documentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/documents',
  component: AdminDocumentsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    syncTargetId: typeof search.syncTargetId === 'string' ? search.syncTargetId : undefined,
    status:
      typeof search.status === 'string' && (DOC_STATUS_FILTERS as readonly string[]).includes(search.status)
        ? (search.status as (typeof DOC_STATUS_FILTERS)[number])
        : ('all' as const),
  }),
});

// --- Reviews ---

const REVIEW_SORT = ['responseScore', 'retrievalScore', 'newest', 'unscored'] as const;
const REVIEW_ANNOTATION = ['all', 'annotated', 'unannotated'] as const;
const REVIEW_FEEDBACK = ['all', 'has-feedback', 'has-negative', 'no-feedback'] as const;

export function validateSearchReviews(search: Record<string, unknown>) {
  return {
    sortBy:
      typeof search.sortBy === 'string' && (REVIEW_SORT as readonly string[]).includes(search.sortBy)
        ? (search.sortBy as (typeof REVIEW_SORT)[number])
        : ('newest' as const),
    annotationStatus:
      typeof search.annotationStatus === 'string' &&
      (REVIEW_ANNOTATION as readonly string[]).includes(search.annotationStatus)
        ? (search.annotationStatus as (typeof REVIEW_ANNOTATION)[number])
        : ('all' as const),
    feedbackStatus:
      typeof search.feedbackStatus === 'string' &&
      (REVIEW_FEEDBACK as readonly string[]).includes(search.feedbackStatus)
        ? (search.feedbackStatus as (typeof REVIEW_FEEDBACK)[number])
        : ('all' as const),
    search: typeof search.search === 'string' ? search.search : undefined,
  };
}

const reviewsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/reviews',
  component: ReviewsPage,
  validateSearch: validateSearchReviews,
});

const reviewDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/reviews/$threadId',
  component: ReviewDetailPage,
});

// --- Datasets ---

const datasetsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets',
  component: DatasetsPage,
});

const datasetCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets/create',
  component: DatasetCreatePage,
});

const datasetDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets/$datasetId',
  component: DatasetDetailPage,
});

// Dataset item routes — nested under datasets
const datasetItemCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets/$datasetId/items/create',
  component: DatasetItemFormPage,
});

const datasetItemDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets/$datasetId/items/$itemId',
  component: DatasetItemFormPage,
});

// --- Experiments ---

const EXPERIMENT_STATUS = ['all', 'pending', 'running', 'completed', 'failed'] as const;

const experimentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments',
  component: ExperimentsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      typeof search.status === 'string' && (EXPERIMENT_STATUS as readonly string[]).includes(search.status)
        ? (search.status as (typeof EXPERIMENT_STATUS)[number])
        : ('all' as const),
  }),
});

// Compare route BEFORE detail route — TanStack Router matches in order,
// '/experiments/compare' would otherwise match as $experimentId = 'compare'
export function validateSearchExperimentCompare(search: Record<string, unknown>) {
  return {
    a: typeof search.a === 'string' ? search.a : '',
    b: typeof search.b === 'string' ? search.b : '',
    item:
      typeof search.item === 'number'
        ? search.item
        : typeof search.item === 'string' && !Number.isNaN(Number(search.item))
          ? Number(search.item)
          : undefined,
  };
}

const experimentCompareRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments/compare',
  component: ExperimentComparePage,
  validateSearch: validateSearchExperimentCompare,
});

const experimentCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments/create',
  component: ExperimentCreatePage,
});

const experimentDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments/$experimentId',
  component: ExperimentDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    result: typeof search.result === 'string' ? search.result : undefined,
  }),
});

// --- Scorers ---

const SCORER_STATUS_FILTERS = ['all', 'draft', 'active', 'archived'] as const;

const scorersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/scorers',
  component: ScorersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      typeof search.status === 'string' && (SCORER_STATUS_FILTERS as readonly string[]).includes(search.status)
        ? (search.status as (typeof SCORER_STATUS_FILTERS)[number])
        : ('all' as const),
  }),
});

const SCORER_TABS = ['configuration', 'versions'] as const;

const scorerCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/scorers/create',
  component: ScorerCreatePage,
});

const scorerDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/scorers/$scorerId',
  component: ScorerDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      typeof search.tab === 'string' && (SCORER_TABS as readonly string[]).includes(search.tab)
        ? (search.tab as (typeof SCORER_TABS)[number])
        : ('configuration' as const),
  }),
});

// --- Traces ---

const TRACE_STATUS = ['all', 'success', 'error', 'partial'] as const;

const tracesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/traces',
  component: TracesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      typeof search.status === 'string' && (TRACE_STATUS as readonly string[]).includes(search.status)
        ? (search.status as (typeof TRACE_STATUS)[number])
        : ('all' as const),
    entityType: typeof search.entityType === 'string' ? search.entityType : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    threadId: typeof search.threadId === 'string' ? search.threadId : undefined,
  }),
});

export function validateSearchTraceDetail(search: Record<string, unknown>) {
  return {
    span: typeof search.span === 'string' ? search.span : undefined,
  };
}

const traceDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/traces/$traceId',
  component: TraceDetailPage,
  validateSearch: validateSearchTraceDetail,
});

// --- Metadata ---

const metadataFieldGroupsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/field-groups',
  component: MetadataFieldGroupsPage,
});

const fieldGroupCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/field-groups/create',
  component: FieldGroupDetailPage,
});

const fieldGroupDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/field-groups/$groupId',
  component: FieldGroupDetailPage,
});

const metadataTemplatesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/templates',
  component: MetadataTemplatesPage,
});

const templateCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/templates/create',
  component: MetadataTemplateDetailPage,
});

const templateDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/metadata/templates/$templateId',
  component: MetadataTemplateDetailPage,
});

// --- Queues ---

const queuesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/queues',
  component: QueuesPage,
});

const JOB_STATES = ['all', 'failed', 'active', 'waiting', 'delayed', 'completed'] as const;

const queueDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/queues/$queueName',
  component: QueueDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search.tab === 'jobs'
        ? ('jobs' as const)
        : search.tab === 'failed-archive'
          ? ('failed-archive' as const)
          : ('overview' as const),
    jobState:
      typeof search.jobState === 'string' && (JOB_STATES as readonly string[]).includes(search.jobState)
        ? (search.jobState as (typeof JOB_STATES)[number])
        : ('all' as const),
  }),
});

// --- Route Tree ---

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    layoutRoute.addChildren([
      dashboardRoute,
      syncSourcesRoute,
      sourceCreateRoute,
      sourceDetailRoute,
      documentsRoute,
      reviewsRoute,
      reviewDetailRoute,
      datasetsRoute,
      datasetCreateRoute,
      datasetDetailRoute,
      datasetItemCreateRoute,
      datasetItemDetailRoute,
      experimentsRoute,
      experimentCompareRoute,
      experimentCreateRoute,
      experimentDetailRoute,
      scorersRoute,
      scorerCreateRoute,
      scorerDetailRoute,
      tracesRoute,
      traceDetailRoute,
      metadataFieldGroupsRoute,
      fieldGroupCreateRoute,
      fieldGroupDetailRoute,
      metadataTemplatesRoute,
      templateCreateRoute,
      templateDetailRoute,
      queuesRoute,
      queueDetailRoute,
    ]),
  ]),
]);
