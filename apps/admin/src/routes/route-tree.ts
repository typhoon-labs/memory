import { createRootRoute, createRoute } from '@tanstack/react-router';
import { AuthGate } from '@typhoon/ui';
import { AdminDashboard } from '../components/pages/dashboard.js';
import { AdminDocumentsPage } from '../components/pages/documents.js';
import { FeedbackPage } from '../components/pages/feedback.js';
import { AdminLoginPage } from '../components/pages/login.js';
import { QueueDetailPage } from '../components/pages/queue-detail.js';
import { QueuesPage } from '../components/pages/queues.js';
import { SyncSourceDetailPage } from '../components/pages/sync-source-detail.js';
import { SyncSourcesPage } from '../components/pages/sync-sources.js';
import { AdminShell } from '../layouts/admin-shell.js';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: AdminLoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AuthGate,
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

const feedbackRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/feedback',
  component: FeedbackPage,
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
    tab: search.tab === 'jobs' ? ('jobs' as const) : ('overview' as const),
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
      feedbackRoute,
      queuesRoute,
      queueDetailRoute,
    ]),
  ]),
]);
