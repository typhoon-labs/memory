# State Management

Typhoon uses **TanStack Query** (React Query) as its sole server state management layer, combined with **URL search params** for UI state. There is no global state store (no Redux, Zustand, or Context-based state).

## Architecture

```
URL params (UI state: filters, tabs, selections)
     +
TanStack Query (server state: data fetching, caching, mutations)
     =
No global store needed
```

## Query Key Factory

All query keys are centralized in `packages/api-client/src/query-keys.ts`. The factory follows a consistent `queryKeys.{domain}.{operation}(params)` pattern:

```typescript
export const queryKeys = {
  documents: {
    all: ['documents'] as const,
    list: (filters?: { syncTargetId?: string }) => [...queryKeys.documents.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.documents.all, 'detail', id] as const,
    chunks: (id: string) => [...queryKeys.documents.all, 'chunks', id] as const,
  },
  syncTargets: {
    all: ['sync-targets'] as const,
    list: () => [...queryKeys.syncTargets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.syncTargets.all, 'detail', id] as const,
  },
  // ... more domains
} as const;
```

### Available Domains

| Domain        | Keys                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `documents`   | `all`, `list`, `detail`, `chunks`, `parsedContent`, `metadataFields` |
| `syncTargets` | `all`, `list`, `detail`, `jobs`, `browse`                            |
| `threads`     | `all`, `list`, `detail`                                              |
| `feedback`    | `all`, `byThread`                                                    |
| `reviews`     | `all`, `list`, `detail`                                              |
| `scorers`     | `all`, `list`, `detail`, `categories`                                |
| `experiments` | `all`, `list`, `detail`, `results`, `compare`                        |
| `datasets`    | `all`, `list`, `detail`, `items`                                     |
| `search`      | `all`, `results`                                                     |
| `dashboard`   | `all`, `scores`, `conversations`, `overview`                         |
| `traces`      | `all`, `list`, `detail`                                              |
| `queues`      | `all`, `list`, `detail`, `jobs`, `failedJobs`                        |
| `metadata`    | `all`, `fieldGroups`, `fieldGroup`, `templates`, `template`          |

The hierarchical structure enables precise or broad invalidation. Invalidating `queryKeys.documents.all` clears all document-related queries; invalidating `queryKeys.documents.detail(id)` clears only one.

## Query Option Factories

Each API module in `@typhoon/api-client` exports `queryOptions()` factories that combine the fetch function, query key, and configuration:

```typescript
// packages/api-client/src/documents.ts
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

export function documentDetailOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.documents.detail(id),
    queryFn: () => apiFetch(`/api/v1/documents/${id}`),
  });
}
```

Pages consume these directly:

```typescript
function DocumentDetailPage() {
  const { documentId } = useParams({ from: '/documents/$documentId' });
  const { data } = useQuery(documentDetailOptions(documentId));
  // ...
}
```

## Feature Hooks

Feature hooks live in `apps/*/src/features/` and wrap API calls with mutation logic and cache invalidation. Each domain gets its own hook file:

```
apps/admin/src/features/
  documents/use-document-mutations.ts
  scorers/use-scorer-mutations.ts
  sync-targets/use-sync-target-mutations.ts
  queues/use-queue-mutations.ts
  queues/use-queue-events.ts
  metadata/use-metadata-mutations.ts
  experiments/use-experiment-mutations.ts
  datasets/use-dataset-mutations.ts
  threads/use-thread-mutations.ts
  reviews/use-review-mutations.ts

apps/desk/src/features/
  threads/use-thread-mutations.ts
  feedback/use-feedback-mutations.ts
  search/use-search.ts
```

### Mutation Pattern

A typical mutation hook:

```typescript
function useSyncTargetMutations() {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/sync-targets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.all,
      });
    },
  });

  return { deleteMutation };
}
```

Key principles:

- **Invalidate, don't update**: After a mutation, invalidate related query keys and let TanStack Query refetch. This avoids manual cache manipulation.
- **Broad invalidation is safe**: Invalidating `queryKeys.syncTargets.all` clears the list and all detail queries. TanStack Query only refetches queries that are currently mounted.
- **Cross-domain invalidation**: Some mutations affect multiple domains. For example, deleting a sync target also invalidates document queries.

## SSE-Driven Invalidation

The Admin app subscribes to a server-sent event stream for real-time queue updates. The `useQueueEvents` hook (`apps/admin/src/features/queues/use-queue-events.ts`) listens for BullMQ job state changes and invalidates relevant queries:

```typescript
function useQueueEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource('/api/v1/queues/events', {
      withCredentials: true,
    });

    es.addEventListener('queue-event', (e) => {
      const { queue } = JSON.parse(e.data);
      // Debounced invalidation per queue
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      if (queue === 'sync') {
        queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.syncTargets.all });
      }
    });

    return () => es.close();
  }, [queryClient]);
}
```

This runs once at the authenticated layout level so a single SSE connection covers the whole Admin app.

### Query Key Pitfalls

- **Always use `queryKeys` from `@typhoon/api-client`** -- ad-hoc string arrays (e.g., `['browse', id]`) won't match SSE-driven invalidation which uses `queryKeys` prefixes
- **Never use `queryKeys.*.fn(id)` for invalidation when the function has optional trailing params** -- e.g., `queryKeys.syncTargets.browse(id)` produces `['sync-targets', 'browse', id, undefined]` which fails TanStack Query's prefix match. Instead use a manual prefix: `['sync-targets', 'browse', id]`

## No Global State Store

The combination of URL params and TanStack Query covers all state needs:

| State type        | Solution                                          |
| ----------------- | ------------------------------------------------- |
| Server data       | TanStack Query (cached, refetchable, stale-aware) |
| Filters/tabs      | URL search params (shareable, deep-linkable)      |
| Form state        | Local component state (React `useState`)          |
| Auth session      | TanStack Query (session endpoint)                 |
| Real-time updates | SSE with query invalidation                       |

This eliminates the complexity of a global store while preserving all the benefits: shared cache, background refetching, optimistic updates, and deduplication.
