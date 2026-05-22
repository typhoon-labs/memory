import { createRootRoute, createRoute } from '@tanstack/react-router';

import { ChatPage } from '../components/pages/chat';
import { DashboardPage } from '../components/pages/dashboard';
import { DocumentsPage } from '../components/pages/documents';
import { DeskLoginPage } from '../components/pages/login';
import { SearchPage } from '../components/pages/search';
import { DeskShell } from '../layouts/desk-shell';
import { DeskAuthGate } from './desk-auth-gate';

// ── Search validators (exported for testing) ──────────────────

export function validateSearchSearch(search: Record<string, unknown>) {
  return {
    q: typeof search.q === 'string' ? search.q : undefined,
    expanded: search.expanded === true || search.expanded === 'true' ? true : undefined,
    doc: typeof search.doc === 'string' ? search.doc : undefined,
    chunk:
      typeof search.chunk === 'number'
        ? search.chunk
        : typeof search.chunk === 'string' && !Number.isNaN(Number(search.chunk))
          ? Number(search.chunk)
          : undefined,
  };
}

export function validateSearchDocuments(search: Record<string, unknown>) {
  return {
    source: typeof search.source === 'string' ? search.source : undefined,
    type: typeof search.type === 'string' ? search.type : undefined,
    filter: typeof search.filter === 'string' ? search.filter : undefined,
    doc: typeof search.doc === 'string' ? search.doc : undefined,
  };
}

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: DeskLoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: DeskAuthGate,
});

const layoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: 'layout',
  component: DeskShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: DashboardPage,
});

const chatRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/chat',
  component: ChatPage,
});

const chatDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/chat/$threadId',
  component: ChatPage,
});

const searchRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/search',
  component: SearchPage,
  validateSearch: validateSearchSearch,
});

const documentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/documents',
  component: DocumentsPage,
  validateSearch: validateSearchDocuments,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    layoutRoute.addChildren([dashboardRoute, chatRoute, chatDetailRoute, searchRoute, documentsRoute]),
  ]),
]);
