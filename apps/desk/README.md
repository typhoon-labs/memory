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
