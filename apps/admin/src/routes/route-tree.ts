import { createRootRoute, createRoute } from '@tanstack/react-router';
import { AdminDashboard } from '../components/pages/dashboard';
import { DatasetDetailPage } from '../components/pages/dataset-detail';
import { DatasetsPage } from '../components/pages/datasets';
import { AdminDocumentsPage } from '../components/pages/documents';
import { ExperimentComparePage } from '../components/pages/experiment-compare';
import { ExperimentDetailPage } from '../components/pages/experiment-detail';
import { ExperimentsPage } from '../components/pages/experiments';
import { AdminLoginPage } from '../components/pages/login';
import { QueueDetailPage } from '../components/pages/queue-detail';
import { QueuesPage } from '../components/pages/queues';
import { ReviewDetailPage } from '../components/pages/review-detail';
import { ReviewsPage } from '../components/pages/reviews';
import { ScorerDetailPage } from '../components/pages/scorer-detail';
import { ScorersPage } from '../components/pages/scorers';
import { SyncSourceDetailPage } from '../components/pages/sync-source-detail';
import { SyncSourcesPage } from '../components/pages/sync-sources';
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

const syncSourcesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources',
  component: SyncSourcesPage,
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

const REVIEW_SORT = ['worstScore', 'newest', 'unscored'] as const;
const REVIEW_ANNOTATION = ['all', 'annotated', 'unannotated'] as const;

const reviewsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/reviews',
  component: ReviewsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sortBy:
      typeof search.sortBy === 'string' && (REVIEW_SORT as readonly string[]).includes(search.sortBy)
        ? (search.sortBy as (typeof REVIEW_SORT)[number])
        : ('worstScore' as const),
    annotationStatus:
      typeof search.annotationStatus === 'string' &&
      (REVIEW_ANNOTATION as readonly string[]).includes(search.annotationStatus)
        ? (search.annotationStatus as (typeof REVIEW_ANNOTATION)[number])
        : ('all' as const),
  }),
});

const reviewDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/reviews/$threadId',
  component: ReviewDetailPage,
});

const datasetsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets',
  component: DatasetsPage,
});

const datasetDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/datasets/$datasetId',
  component: DatasetDetailPage,
});

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
const experimentCompareRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments/compare',
  component: ExperimentComparePage,
  validateSearch: (search: Record<string, unknown>) => ({
    a: typeof search.a === 'string' ? search.a : '',
    b: typeof search.b === 'string' ? search.b : '',
  }),
});

const experimentDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/experiments/$experimentId',
  component: ExperimentDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    result: typeof search.result === 'string' ? search.result : undefined,
  }),
});

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

const traceDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/traces/$traceId',
  component: TraceDetailPage,
});

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

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    layoutRoute.addChildren([
      dashboardRoute,
      syncSourcesRoute,
      sourceDetailRoute,
      documentsRoute,
      reviewsRoute,
      reviewDetailRoute,
      datasetsRoute,
      datasetDetailRoute,
      experimentsRoute,
      experimentCompareRoute,
      experimentDetailRoute,
      scorersRoute,
      scorerDetailRoute,
      tracesRoute,
      traceDetailRoute,
      queuesRoute,
      queueDetailRoute,
    ]),
  ]),
]);
