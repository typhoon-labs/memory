import { createRootRoute, createRoute } from '@tanstack/react-router';
import { AuthGate } from '@typhoon/ui';
import { ChatPage } from '../components/pages/chat.js';
import { DashboardPage } from '../components/pages/dashboard.js';
import { DocumentsPage } from '../components/pages/documents.js';
import { DeskLoginPage } from '../components/pages/login.js';
import { SearchPage } from '../components/pages/search.js';
import { DeskShell } from '../layouts/desk-shell.js';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: DeskLoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AuthGate,
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
});

const documentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/documents',
  component: DocumentsPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([
    layoutRoute.addChildren([dashboardRoute, chatRoute, chatDetailRoute, searchRoute, documentsRoute]),
  ]),
]);
