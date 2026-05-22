# Frontend

Typhoon's frontend consists of three applications and three shared packages, all built on React 19 with TypeScript.

## Applications

| App    | Port | Package       | Purpose                                                                                      |
| ------ | ---- | ------------- | -------------------------------------------------------------------------------------------- |
| Admin  | 5174 | `apps/admin`  | Admin dashboard: sources, documents, reviews, experiments, scoring, queues, traces, metadata |
| Desk   | 5173 | `apps/desk`   | Rep workspace: chat, search, documents, feedback                                             |
| Widget | 5175 | `apps/widget` | Embeddable customer-facing chat widget                                                       |

## Shared Packages

| Package            | Path                  | Purpose                                                                        |
| ------------------ | --------------------- | ------------------------------------------------------------------------------ |
| `@typhoon/ui`         | `packages/ui`         | Radix UI primitives with shadcn-style components, CVA variants, `cn()` utility |
| `@typhoon/chat`       | `packages/chat`       | Chat UI components and hooks (stream stall detection)                          |
| `@typhoon/api-client` | `packages/api-client` | Typed API calls, centralized query keys, TanStack Query option factories       |

## Stack

- **React 19** -- concurrent features, hooks
- **Vite** -- build tool with HMR in development
- **TanStack Router** -- code-based route trees with type-safe URL params
- **TanStack Query** -- server state management with query key factories
- **Radix UI** -- unstyled accessible primitives (shadcn-style wrappers in `@typhoon/ui`)
- **AI SDK React** -- `useChat` hook for streaming chat with Mastra agents
- **CVA** -- class-variance-authority for component variants
- **Tailwind CSS** -- utility-first styling with `cn()` for class merging

## Architecture Pattern

```
Pages  -->  Feature Hooks  -->  API Client
```

- **Pages** (`apps/*/src/components/pages/`) -- composition and layout only. No business logic.
- **Feature Hooks** (`apps/*/src/features/`) -- app-specific mutations wrapping API calls with cache invalidation.
- **API Client** (`packages/api-client/src/`) -- typed fetch calls, centralized query keys, TanStack Query option factories.

This separation keeps pages declarative, mutation logic co-located with the domain, and API calls shared across apps.

## Development

Start individual frontend apps in development:

```bash
bun run dev:desk    # Rep workspace at http://localhost:5173
bun run dev:admin   # Admin dashboard at http://localhost:5174
bun run dev:widget  # Chat widget at http://localhost:5175
```

Or start everything via Docker:

```bash
bun run docker:up   # All services including frontends with HMR
```

## Sub-Pages

- [Routing](./routing.md) -- TanStack Router patterns, code-based route trees, URL state management
- [State Management](./state-management.md) -- TanStack Query patterns, query key factories, cache invalidation
- [UI Patterns](./ui-patterns.md) -- component conventions, page layouts, entity creation flows
- [Chat and Streaming](./chat-streaming.md) -- SSE patterns, AI SDK integration, stall detection
