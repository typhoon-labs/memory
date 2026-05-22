# Routing

Typhoon uses TanStack Router with **code-based route trees** (not file-based). Routes are defined programmatically with full TypeScript type safety for path params, search params, and navigation.

## Route Tree Structure

Each app defines its route tree in `apps/*/src/routes/route-tree.ts`. The tree uses `createRootRoute` and `createRoute` from `@tanstack/react-router`:

```typescript
import { createRootRoute, createRoute } from '@tanstack/react-router';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AuthGate, // wraps children with auth check
});

const layoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: 'layout',
  component: AppShell, // sidebar, header, navigation
});

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: DashboardPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([layoutRoute.addChildren([dashboardRoute /* ... */])]),
]);
```

### Route Nesting

Routes follow a consistent nesting pattern:

1. **Root** -- top-level container
2. **Login** -- unauthenticated route
3. **Authenticated** -- pathless layout route that checks auth (redirects to `/login` if unauthenticated)
4. **Layout** -- pathless layout route that renders the app shell (sidebar, header)
5. **Pages** -- actual content routes nested under the layout

### Route Ordering

TanStack Router matches routes in the order they are defined in the children array. Static segments must come before dynamic segments to avoid false matches:

```typescript
// '/sources/create' MUST be defined BEFORE '/sources/$sourceId'
// Otherwise '$sourceId' would match the literal string 'create'
const sourceCreateRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources/create',
  component: SyncSourceCreatePage,
});

const sourceDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sources/$sourceId',
  component: SyncSourceDetailPage,
});
```

## Type-Safe URL Search Params

All filters, selections, and tab states are URL-backed via `validateSearch`. This provides type safety, deep linking, and shareable URLs:

```typescript
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
```

### Common Patterns

- **Tab selection**: `?tab=documents` -- active tab stored in URL
- **List filters**: `?status=active&sortBy=newest` -- filter state in URL
- **Detail expansion**: `?expanded=true&doc=abc&chunk=3` -- which item is expanded
- **Search queries**: `?q=search+term` -- search input text

### Reading and Writing URL State

Components use `useSearch` to read and `useNavigate` to write:

```typescript
function MyComponent() {
  const { tab, status } = useSearch({ from: '/sources/$sourceId' });
  const navigate = useNavigate();

  const setTab = (newTab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab: newTab }) });
  };

  // ...
}
```

### Desk Search Page Example

The Desk search page demonstrates URL params for a search interface:

```typescript
validateSearch: (search: Record<string, unknown>) => ({
  q: typeof search.q === 'string' ? search.q : undefined,
  expanded: search.expanded === true || search.expanded === 'true' ? true : undefined,
  doc: typeof search.doc === 'string' ? search.doc : undefined,
  chunk:
    typeof search.chunk === 'number'
      ? search.chunk
      : typeof search.chunk === 'string' && !Number.isNaN(Number(search.chunk))
        ? Number(search.chunk)
        : undefined,
});
```

This makes search results, expanded documents, and selected chunks all deep-linkable: `http://localhost:5173/search?q=refund+policy&doc=abc123&chunk=2`.

## Navigation

Always use TanStack Router's `<Link>` component for internal navigation:

```typescript
import { Link } from '@tanstack/react-router';

// Correct
<Link to="/sources/$sourceId" params={{ sourceId: 'abc' }}>
  View Source
</Link>

// Incorrect -- causes full page reload
<a href={`/sources/${sourceId}`}>View Source</a>
```

Plain `<a href>` tags bypass the router, causing a full page reload and losing all client state.

## Auth Routes

Both Admin and Desk apps follow the same auth pattern:

- `/login` -- login page (outside the auth gate)
- All other routes are nested under `authenticatedRoute`, which renders an `AuthGate` component
- `AuthGate` checks the session; if unauthenticated, redirects to `/login`
- After successful OIDC login, the callback redirects back to the original URL

## Admin App Routes

| Path                                 | Component                  | Search params                                            |
| ------------------------------------ | -------------------------- | -------------------------------------------------------- |
| `/`                                  | AdminDashboard             | --                                                       |
| `/sources`                           | SyncSourcesPage            | --                                                       |
| `/sources/create`                    | SyncSourceCreatePage       | --                                                       |
| `/sources/$sourceId`                 | SyncSourceDetailPage       | `tab`, `path`                                            |
| `/documents`                         | AdminDocumentsPage         | `syncTargetId`, `status`                                 |
| `/reviews`                           | ReviewsPage                | `sortBy`, `annotationStatus`, `feedbackStatus`, `search` |
| `/reviews/$threadId`                 | ReviewDetailPage           | --                                                       |
| `/datasets`                          | DatasetsPage               | --                                                       |
| `/datasets/create`                   | DatasetCreatePage          | --                                                       |
| `/datasets/$datasetId`               | DatasetDetailPage          | --                                                       |
| `/datasets/$datasetId/items/create`  | DatasetItemFormPage        | --                                                       |
| `/datasets/$datasetId/items/$itemId` | DatasetItemFormPage        | --                                                       |
| `/experiments`                       | ExperimentsPage            | `status`                                                 |
| `/experiments/compare`               | ExperimentComparePage      | `a`, `b`, `item`                                         |
| `/experiments/create`                | ExperimentCreatePage       | --                                                       |
| `/experiments/$experimentId`         | ExperimentDetailPage       | `result`                                                 |
| `/scorers`                           | ScorersPage                | `status`                                                 |
| `/scorers/create`                    | ScorerCreatePage           | --                                                       |
| `/scorers/$scorerId`                 | ScorerDetailPage           | `tab`                                                    |
| `/traces`                            | TracesPage                 | `status`, `entityType`, `search`, `threadId`             |
| `/traces/$traceId`                   | TraceDetailPage            | `span`                                                   |
| `/metadata/field-groups`             | MetadataFieldGroupsPage    | --                                                       |
| `/metadata/field-groups/create`      | FieldGroupDetailPage       | --                                                       |
| `/metadata/field-groups/$groupId`    | FieldGroupDetailPage       | --                                                       |
| `/metadata/templates`                | MetadataTemplatesPage      | --                                                       |
| `/metadata/templates/create`         | MetadataTemplateDetailPage | --                                                       |
| `/metadata/templates/$templateId`    | MetadataTemplateDetailPage | --                                                       |
| `/queues`                            | QueuesPage                 | --                                                       |
| `/queues/$queueName`                 | QueueDetailPage            | `tab`, `jobState`                                        |

## Desk App Routes

| Path              | Component     | Search params                     |
| ----------------- | ------------- | --------------------------------- |
| `/`               | DashboardPage | --                                |
| `/chat`           | ChatPage      | --                                |
| `/chat/$threadId` | ChatPage      | --                                |
| `/search`         | SearchPage    | `q`, `expanded`, `doc`, `chunk`   |
| `/documents`      | DocumentsPage | `source`, `type`, `filter`, `doc` |
