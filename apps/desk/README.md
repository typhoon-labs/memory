# @typhoon/desk

Customer-facing knowledge desk with AI chat and document search. Built with React 19 + Vite + TanStack Router.

## Running

```bash
bun run dev   # Development server
```

Default: `http://localhost:5173`

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard home |
| `/chat` | Streaming AI chat with the Typhoon agent |
| `/documents` | Knowledge base document browser |
| `/search` | Hybrid/semantic document search |
| `/login` | Authentication page |

## Deep Linking (URL State)

All meaningful UI state is persisted in URL search parameters so views are shareable and survive page refresh.

**`/search`**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search query (auto-executes on page load) |
| `expanded` | boolean | Deep/expanded search mode |
| `doc` | string | Selected document ID (opens viewer panel) |
| `chunk` | number | Selected chunk index within expanded results |

**`/documents`**
| Param | Type | Description |
|-------|------|-------------|
| `source` | string | Filter by sync source ID |
| `type` | string | Filter by document type (PDF, Word, etc.) |
| `filter` | string | Text filter (committed on Enter/blur) |
| `doc` | string | Selected document ID (opens viewer panel) |

Example shareable URLs:
- `/search?q=refund+policy&expanded=true` — expanded search for "refund policy"
- `/documents?source=abc123&type=PDF` — PDFs from a specific source

## Browser Tab Titles

Each page sets a dynamic `document.title` via `usePageTitle` and `detailTitle` from `src/hooks/use-page-title.ts`. The app suffix ("Typhoon Desk") and hierarchy separator (`:`) are defined as constants there.

- Static pages: "Dashboard - Typhoon Desk", "Documents - Typhoon Desk"
- Search with query: "Search: refund policy - Typhoon Desk"
- Chat with thread: "Chat: Refund request - Typhoon Desk"

## Key Features

- Streaming chat responses via SSE (Vercel AI SDK)
- Chat history with persistent threads
- Resilient thread switching — Chat instances persist in a Map so in-flight streams survive navigation between threads
- Automatic recovery after page refresh — threads and messages refetch until populated (2-minute window)
- Document viewer with markdown rendering
- Search with metadata filters
- User feedback submission (thumbs up/down with comments)
- Thread management (create, resume, delete)

## Dependencies

`@typhoon/chat` (chat components), `@typhoon/ui` (component library), `@ai-sdk/react`, `@tanstack/react-router`, `@tanstack/react-query`

Connects to `@typhoon/api` endpoints (`/v1/chat`, `/v1/search`, `/v1/documents`).
