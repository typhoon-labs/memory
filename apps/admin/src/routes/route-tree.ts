import { createRootRoute, createRoute } from '@tanstack/react-router';
import { AuthGate } from '@typhoon/ui';
import { AdminDashboard } from '../components/pages/dashboard.js';
import { AdminDocumentsPage } from '../components/pages/documents.js';
import { FeedbackPage } from '../components/pages/feedback.js';
import { AdminLoginPage } from '../components/pages/login.js';
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

const sourceDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources/$sourceId',
  component: SyncSourceDetailPage,
});

const documentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/documents',
  component: AdminDocumentsPage,
});

const feedbackRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/feedback',
  component: FeedbackPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    layoutRoute.addChildren([dashboardRoute, syncSourcesRoute, sourceDetailRoute, documentsRoute, feedbackRoute]),
  ]),
]);
