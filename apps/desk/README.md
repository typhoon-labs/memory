# @typhoon/desk

Customer-facing knowledge desk with AI chat, document search, and a conversation dashboard. Built with React 19 + Vite + TanStack Router. Used by support representatives and end users to interact with the Typhoon knowledge agent.

## Architecture Context

The desk app is the primary user-facing interface for the Typhoon chatbot system. Representatives and authenticated users can chat with the AI agent, search the knowledge base, browse documents, and provide feedback on responses. It communicates with the `@typhoon/api` backend through a Vite dev proxy.

Authentication requires either the `admin` or `rep` role, enforced by `DeskAuthGate` which wraps all authenticated routes with `AuthGate requiredRoles={['admin', 'rep']}`. OIDC is the only sign-in method.

Chat streaming uses the AI SDK v6 `DefaultChatTransport` + `useChat` hook consuming the Mastra-powered `/api/v1/chat/typhoon-supervisor` endpoint. Thread memory is server-managed via the Mastra memory system; the client sends `memory: { thread, resource }` with each request.

## Running

```bash
bun run dev   # Development server on http://localhost:5173
bun run build # Production build (tsc + vite build)
```

Default: `http://localhost:5173`

## Internal Structure

```
src/
  main.tsx              Entry point: React root, providers (Theme, QueryClient, Auth, Router)
  main.css              Tailwind import
  test-utils.ts         renderWithQueryClient helper for component tests
  routes/
    route-tree.ts       Route tree with validateSearch for search + documents routes
    desk-auth-gate.tsx  Wraps authenticated routes (requires admin or rep role)
  layouts/
    desk-shell.tsx      AppShell layout with flat nav (Dashboard, Chat, Search, Documents)
  components/
    pages/
      chat.tsx          Streaming AI chat with thread management and document viewer
      chat-utils.ts     Title extraction from tool output, message seeding logic
      dashboard.tsx     Overview dashboard with stat cards and activity widgets
      documents.tsx     Document browser with filters and inline viewer
      search.tsx        Hybrid/semantic search with grouped results and viewer
      login.tsx         OIDC login page
    chat/
      thread-sidebar.tsx  Thread list sidebar (desktop fixed, mobile slide-over)
      use-thread.ts       useThreads + useThread query hooks with auto-refetch
      use-feedback.ts     Feedback state management with optimistic updates
    dashboard/
      conversation-activity.tsx  Recent conversations list widget
      conversation-volume.tsx    7-day conversation volume bar chart
      volume-chart.tsx           Recharts bar chart for volume data
      quick-access.tsx           Quick action buttons (New Chat, Search KB)
      widget-card.tsx            Card wrapper for dashboard widgets
  features/
    feedback/
      use-feedback-mutations.ts  useUpsertFeedback with optimistic updates
    search/
      use-search.ts              useSearch query hook for hybrid search
    threads/
      use-thread-mutations.ts    useDeleteThread mutation
  hooks/
    use-page-title.ts  usePageTitle + detailTitle helper (suffix: "Typhoon Desk")
```

## Pages and Routes

All routes sit under an authenticated layout (`DeskAuthGate` -> `DeskShell`). The login route is the only unauthenticated page.

| Route             | Component       | Description                                                      |
| ----------------- | --------------- | ---------------------------------------------------------------- |
| `/login`          | `DeskLoginPage` | OIDC authentication page                                         |
| `/`               | `DashboardPage` | Overview with stat cards, recent conversations, and volume chart |
| `/chat`           | `ChatPage`      | New chat (no thread selected)                                    |
| `/chat/$threadId` | `ChatPage`      | Resume existing thread                                           |
| `/search`         | `SearchPage`    | Hybrid/semantic document search with viewer panel                |
| `/documents`      | `DocumentsPage` | Knowledge base document browser with filters and viewer          |

## Deep Linking (URL State)

All meaningful UI state is persisted in URL search parameters so views are shareable and survive page refresh.

**`/search`**

| Param      | Type    | Description                                                                      |
| ---------- | ------- | -------------------------------------------------------------------------------- |
| `q`        | string  | Search query (auto-executes on page load if present)                             |
| `expanded` | boolean | Deep/expanded search mode (shows individual passages instead of document groups) |
| `doc`      | string  | Selected document ID (opens viewer panel)                                        |
| `chunk`    | number  | Selected chunk index within expanded results                                     |

**`/documents`**

| Param    | Type   | Description                                                             |
| -------- | ------ | ----------------------------------------------------------------------- |
| `source` | string | Filter by sync target ID                                                |
| `type`   | string | Filter by document type (PDF, Word, Markdown, Spreadsheet, Text, Other) |
| `filter` | string | Text filter (committed on Enter or blur via `useUrlSearchInput`)        |
| `doc`    | string | Selected document ID (opens viewer panel)                               |

Example shareable URLs:

- `/search?q=refund+policy&expanded=true` -- expanded search for "refund policy"
- `/search?q=warranty&doc=doc123&chunk=2` -- search result with specific passage selected
- `/documents?source=abc123&type=PDF` -- PDFs from a specific source
- `/documents?filter=returns&doc=xyz789` -- filtered list with document viewer open

## Browser Tab Titles

Each page sets a dynamic `document.title` via `usePageTitle` and `detailTitle` from `src/hooks/use-page-title.ts`. The app suffix ("Typhoon Desk") and hierarchy separator (`:`) are defined as constants there.

- Static pages: "Dashboard - Typhoon Desk", "Documents - Typhoon Desk"
- Search with query: "Search: refund policy - Typhoon Desk"
- Chat with thread: "Chat: Refund request - Typhoon Desk"

## Layout Structure

`DeskShell` renders the shared `AppShell` component (from `@typhoon/ui`) with a single flat navigation group (no group labels):

- Dashboard (`/`)
- Chat (`/chat`)
- Search (`/search`)
- Documents (`/documents`)

The user menu shows the authenticated user's email with a sign-out option.

## Key Features

### Chat

The chat page (`ChatPage`) is the most complex component in the desk app. Key implementation details:

- **Streaming transport** -- `DefaultChatTransport` sends messages to `/api/v1/chat/typhoon-supervisor` with `Accept: text/event-stream`. Each request includes `memory: { thread: threadId, resource: userId }` for server-side thread persistence.
- **Chat instance persistence** -- A `Map<string, Chat>` in a ref persists `Chat` instances across thread switches. When navigating between threads, the previous thread's in-flight stream continues uninterrupted. Each thread gets its own `Chat` instance with a dedicated transport.
- **Thread auto-creation** -- When sending a message with no thread selected, the app creates a new thread via `POST /api/v1/threads`, optimistically adds it to the sidebar with a truncated message preview as title, then navigates to `/chat/$threadId` and sends the pending message.
- **Title detection** -- `extractTitleFromMessages()` scans message parts for `setThreadTitle` tool output and updates the thread list cache immediately without refetching.
- **Title polling** -- For newly created threads, a polling loop checks for server-generated titles every 5 seconds (up to 24 attempts / 2 minutes). This handles the async title generation that runs after the agent responds.
- **Server message seeding** -- When navigating to an existing thread, `shouldSeedMessages()` determines whether to populate the `Chat` instance with messages from the server (only when the chat is empty, not streaming, and has server data).
- **Stall detection** -- `useStreamStallDetection` (from `@typhoon/chat`) monitors message updates during streaming and auto-aborts after 15 seconds of inactivity. This handles the case where the server dies mid-stream and the AI SDK's reader hangs forever.
- **Document viewer** -- Citations in chat messages open a resizable `DocumentViewerPanel` alongside the chat. A trigger counter forces remount on every citation click for fresh highlight detection.

### Thread Sidebar

`ThreadSidebar` provides a responsive thread list:

- **Desktop** -- fixed 256px sidebar with thread list, "New Chat" button, and per-thread delete
- **Mobile** -- collapsible slide-over panel with backdrop dismiss
- **Auto-refetch** -- `useThreads` polls every 5 seconds when recent untitled threads exist (waiting for title generation). `useThread` polls similarly for threads with no messages (recovery after page refresh within a 2-minute window).

### Search

The search page provides hybrid (vector + full-text) search across all knowledge base documents:

- **Two display modes** -- default mode groups results by document (showing best score and match count per document); expanded mode shows individual passages with per-chunk scores
- **Enrichment** -- results are enriched with document metadata and sync target names from cached queries
- **Infinite scroll** -- `IntersectionObserver` on a sentinel element loads more results in pages of 10
- **Document viewer** -- clicking a result opens a resizable `DocumentViewerPanel` with search term highlighting and passage-level scrolling (in expanded mode, scrolls to the specific chunk's `startIndex`)
- **Document prefetch** -- hovering over a result prefetches the document content and parsed content queries

### Documents

The documents page provides a sortable, filterable table of all knowledge base documents:

- **Filters** -- sync target dropdown, document type dropdown (PDF, Word, Markdown, Spreadsheet, Text, Other), and text search (committed on Enter/blur)
- **DataTable** -- paginated table (20 per page) with sortable columns: Name, Source, Type, Size, Updated
- **Status display** -- processing/pending documents show a warning badge; errored documents show an error badge
- **Auto-refresh** -- query polls every 3 seconds when any document is in `pending` or `processing` status
- **Document viewer** -- clicking a row opens a resizable `DocumentViewerPanel` alongside the table

### Dashboard

Overview page for representatives with:

- **Greeting** -- time-of-day greeting with user's first name
- **Stat cards** -- total conversations, today's count, satisfaction percentage (30-day positive feedback ratio), total/ready documents
- **Quick access** -- "New chat" and "Search KB" buttons
- **Conversation activity** -- recent conversations list (links to chat)
- **Conversation volume** -- 7-day bar chart of daily conversation counts

### Feedback

User feedback (thumbs up/down with optional comment) is managed at two levels:

- **`useFeedback`** (in `components/chat/`) -- per-thread feedback state with optimistic updates. Maintains a `Map<messageId, { rating, comment }>` for the chat UI.
- **`useUpsertFeedback`** (in `features/feedback/`) -- centralized mutation using the `@typhoon/api-client` feedback API with optimistic cache updates and rollback on error.

## Feature Hooks and State Management

| Hook                | Location             | What it does                                                  | Invalidates                   |
| ------------------- | -------------------- | ------------------------------------------------------------- | ----------------------------- |
| `useSearch`         | `features/search/`   | Query hook for hybrid search via `POST /api/v1/search/hybrid` | (read-only query)             |
| `useUpsertFeedback` | `features/feedback/` | Upsert feedback with optimistic updates                       | `feedback.byThread(threadId)` |
| `useDeleteThread`   | `features/threads/`  | Delete thread + messages                                      | `threads.all`                 |
| `useThreads`        | `components/chat/`   | Fetch thread list (50 per page), auto-refetch for untitled    | (read-only query)             |
| `useThread`         | `components/chat/`   | Fetch thread detail + messages, auto-refetch for empty        | (read-only query)             |
| `useFeedback`       | `components/chat/`   | Per-thread feedback with optimistic updates                   | `['feedback', threadId]`      |

Query keys come from `@typhoon/api-client` (`queryKeys.feedback`, `queryKeys.search`, `queryKeys.threads`). Some hooks (e.g., `useThreads`, `useFeedback`) use inline query keys for historical reasons.

## Component Test Patterns

Tests use Vitest + Testing Library and follow the same patterns as `@typhoon/admin`:

- **`renderWithQueryClient`** (`src/test-utils.ts`) -- wraps component in a fresh `QueryClientProvider` with retries disabled and zero GC time.
- **TanStack Router mocking** -- `vi.mock('@tanstack/react-router')` with `useNavigate`, `useSearch`, `useParams` as needed.
- **API mocking** -- `vi.mock('@typhoon/ui')` with `importActual` spread and `apiFetch: vi.fn()`.
- **Chat mocking** -- `vi.mock('@ai-sdk/react')` for `useChat`, `vi.mock('ai')` for `DefaultChatTransport` and `Chat`.
- **Pure function testing** -- `chat-utils.test.ts` tests `extractTitleFromMessages` and `shouldSeedMessages` as pure functions with no mocking needed.

## Configuration

| Setting                 | Source                     | Default                 |
| ----------------------- | -------------------------- | ----------------------- |
| Dev server port         | `vite.config.ts`           | `5173`                  |
| API proxy target        | `API_PROXY_TARGET` env var | `http://localhost:5172` |
| Theme storage key       | `main.tsx` ThemeProvider   | `typhoon-theme`            |
| Query stale time        | `main.tsx` QueryClient     | 30 seconds              |
| Query retry count       | `main.tsx` QueryClient     | 1                       |
| Refetch on window focus | `main.tsx` QueryClient     | Disabled                |

The Vite dev server proxies all `/api/*` requests to the API server.

## Dependencies

| Package                  | Purpose                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `@typhoon/ui`               | Shared component library (AppShell, DataTable, StatCard, StatusBadge, ResizablePanel, etc.) |
| `@typhoon/api-client`       | Centralized query keys and typed API helpers                                                |
| `@typhoon/chat`             | Chat components (TyphoonThread, DocumentViewerPanel), useStreamStallDetection hook             |
| `@typhoon/config`           | Shared TypeScript and Vite config, APP_ROLES constants                                      |
| `@ai-sdk/react`          | AI SDK React hooks (useChat, Chat class)                                                    |
| `ai`                     | AI SDK core (DefaultChatTransport, UIMessage types)                                         |
| `@tanstack/react-router` | Client-side routing with type-safe search params                                            |
| `@tanstack/react-query`  | Server state management, caching, mutations                                                 |
| `recharts`               | Charts (conversation volume bar chart)                                                      |
| `lucide-react`           | Icons                                                                                       |
| `better-auth`            | Auth client (OIDC via Dex in dev)                                                           |

## Cross-References

- [Architecture](../../docs/architecture.md) -- system-wide architecture and data flow
- [API Reference](../../docs/api-reference.md) -- all API endpoints consumed by this app
- [Environment Variables](../../docs/environment-variables.md) -- full env var reference
- [Design](../../docs/design.md) -- UI/UX design system and conventions
- [Getting Started](../../docs/getting-started.md) -- first-time setup instructions
- [Ingestion and RAG](../../docs/ingestion-and-rag.md) -- how documents are indexed and searched
