# @typhoon/widget

Embeddable customer support chat widget. Builds to a single JavaScript file (`typhoon-widget.js`) with inlined CSS that can be dropped into any website via a script tag. No framework dependencies leak to the host page.

## Architecture Context

The widget is a standalone, self-contained chat client designed for embedding in third-party websites. Unlike the desk and admin apps, it has no router, no auth provider, and no shared component library -- it is a single React component rendered into a shadow-free DOM node. Authentication is handled via API key (`X-API-Key` header) rather than session cookies.

The widget communicates with the Typhoon API via the `/api/v1/widget/chat` endpoint using the AI SDK v6 `DefaultChatTransport`. Thread persistence is managed server-side through the Mastra memory system; the widget sends `memory: { thread, resource }` with each message.

## Usage

```html
<script
  src="https://your-domain.com/typhoon-widget.js"
  data-typhoon-api-key="sk_..."
  data-typhoon-server="https://api.your-domain.com"
  data-typhoon-title="Support"
  data-typhoon-theme="auto"
></script>
```

The full embed snippet with all attributes:

```html
<script
  src="https://your-domain.com/typhoon-widget.js"
  data-typhoon-api-key="sk_live_abc123"
  data-typhoon-server="https://api.your-domain.com"
  data-typhoon-title="Customer Support"
  data-typhoon-theme="auto"
></script>
```

If `data-typhoon-api-key` is missing or empty, the widget renders nothing (silent no-op).

## Configuration Attributes

All configuration is read from `data-*` attributes on the `<script>` tag that loads the widget.

| Attribute           | Required | Default        | Description                                                                                                                                                                                                       |
| ------------------- | -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-typhoon-api-key` | Yes      | --             | API key for authentication. Sent as `X-API-Key` header on every request. Keys must be created by an admin via the admin dashboard. If empty, the widget does not render.                                          |
| `data-typhoon-server`  | Yes      | --             | Base URL of the Typhoon API server (e.g., `https://api.your-domain.com`). The widget appends `/api/v1/widget/chat` to this.                                                                                          |
| `data-typhoon-title`   | No       | `Typhoon Support` | Text displayed in the chat popup header.                                                                                                                                                                          |
| `data-typhoon-theme`   | No       | `light`        | Visual theme. Accepts `light`, `dark`, or `auto`. When set to `auto`, the widget detects the user's system preference via `prefers-color-scheme` media query and updates dynamically when the preference changes. |

## How It Works

### Initialization

1. The script tag is loaded and executes immediately.
2. Configuration is read from the script tag's own `data-*` attributes via `document.querySelector('script[data-typhoon-api-key]')`.
3. A container element (`#typhoon-widget-root`) is created and appended to `document.body` (or reused if one already exists).
4. Theme class (`typhoon-dark`) is applied to the container based on the `data-typhoon-theme` attribute.
5. A React root is created inside the container and the `TyphoonWidget` component is rendered in `StrictMode`.

### Thread Persistence (localStorage)

Thread IDs are stored in `localStorage` to maintain conversation continuity across page loads:

- **Storage key**: `typhoon:thread:{apiKey}` -- scoped per API key so different widgets on the same domain maintain separate conversations.
- **On load**: checks for an existing thread ID in localStorage. If found, reuses it. If not, generates a new UUID via `crypto.randomUUID()` and stores it.
- **New conversation**: the "+" button in the header generates a fresh thread ID, updates localStorage, and clears the message list.
- **Resource ID**: `widget:{apiKey}` -- identifies the widget instance to the server's memory system.

### Chat Transport

The widget uses the AI SDK v6 `DefaultChatTransport`:

```
API endpoint: {serverUrl}/api/v1/widget/chat
Headers:      X-API-Key: {apiKey}
Body:         { messages, trigger, memory: { thread: threadId, resource: resourceId } }
```

The transport is memoized via `useMemo` (created once per widget lifetime). The `threadIdRef` is used instead of the state value in `prepareSendMessagesRequest` to avoid stale closures when the thread changes.

### Stall Detection

The widget includes its own inline stall detection (not using the shared `@typhoon/chat` hook, since the widget has no package dependencies beyond `ai` and `react`):

- Tracks the last activity timestamp (updated whenever messages change or status transitions to `submitted`).
- While streaming or submitted, checks every 5 seconds if more than 15 seconds have elapsed since the last activity.
- If stalled, calls `stop()` and sets a `stallError` ("Connection lost").
- The combined error (`error ?? stallError`) is displayed as "Something went wrong. Please try again."

### UI Components

The widget renders two elements, both fixed-positioned:

1. **Toggle button** (`.typhoon-toggle`) -- 48px circle in the bottom-right corner. Shows a chat bubble icon when closed, an X when open.
2. **Chat popup** (`.typhoon-popup`) -- 380px wide (responsive, max `calc(100vw - 2rem)`), max 520px tall. Contains:
   - **Header** -- title text + "new conversation" button
   - **Messages area** -- scrollable, auto-scrolls to bottom on new messages. Shows welcome message when empty, "Thinking..." indicator during submission, error message on failure.
   - **Input area** -- text input + Send/Stop button. Send is disabled when input is empty. Stop appears during streaming and calls `stop()`.

## Theme Detection

The `data-typhoon-theme` attribute controls visual theming via CSS custom properties on `#typhoon-widget-root`:

| Theme   | Behavior                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `light` | Default. No `typhoon-dark` class applied. Light CSS variables.                                                                              |
| `dark`  | `typhoon-dark` class applied immediately. Dark CSS variables.                                                                               |
| `auto`  | Detects `prefers-color-scheme: dark` on load. Adds a `change` event listener on the media query to toggle `typhoon-dark` class dynamically. |

CSS custom properties (light / dark):

| Variable            | Light     | Dark                     |
| ------------------- | --------- | ------------------------ |
| `--typhoon-primary`    | `#18181b` | `#e4e4e7`                |
| `--typhoon-primary-fg` | `#fafafa` | `#18181b`                |
| `--typhoon-muted`      | `#f4f4f5` | `rgba(255,255,255,0.08)` |
| `--typhoon-muted-fg`   | `#71717a` | `#a1a1aa`                |
| `--typhoon-border`     | `#e4e4e7` | `rgba(255,255,255,0.08)` |
| `--typhoon-bg`         | `#ffffff` | `#09090b`                |
| `--typhoon-fg`         | `#18181b` | `#fafafa`                |
| `--typhoon-radius`     | `0.5rem`  | `0.5rem`                 |

## Single-File Architecture

The entire widget is a single React component (`TyphoonWidget`) in `src/main.tsx` plus CSS in `src/main.css`. There are no sub-components, no router, no query client, and no shared packages (other than `react`, `react-dom`, `ai`, and `@ai-sdk/react`).

This is intentional:

- **Minimal bundle size** -- no router, no query client, no component library overhead.
- **No host page conflicts** -- all CSS classes use the `typhoon-` prefix. No global style resets. The widget creates its own DOM container.
- **Self-contained** -- the widget works on any page without requiring the host to install React or any other dependency. React is bundled into the output file.

## Building

```bash
bun run build   # Produces dist/typhoon-widget.js + dist/typhoon-widget.css
```

The Vite config produces deterministic filenames for cache-friendly deployment:

- `typhoon-widget.js` -- single entry file (not hashed)
- `typhoon-widget.css` -- styles extracted alongside (not hashed)

Rollup options in `vite.config.ts`:

```ts
build: {
  rollupOptions: {
    output: {
      entryFileNames: 'typhoon-widget.js',
      assetFileNames: 'typhoon-widget.[ext]',
    },
  },
},
```

## Development

```bash
bun run dev   # Dev server on http://localhost:5175
```

Note: Unlike the admin and desk apps, the widget dev server does **not** proxy API requests. The `data-typhoon-server` attribute must point to a running API server (e.g., `http://localhost:5172`) for the widget to function during development.

## Dependencies

| Package         | Purpose                                   |
| --------------- | ----------------------------------------- |
| `react`         | UI framework (bundled into output)        |
| `react-dom`     | DOM rendering (bundled into output)       |
| `@ai-sdk/react` | `useChat` hook for streaming chat         |
| `ai`            | `DefaultChatTransport`, `UIMessage` types |

Dev dependencies: Vite, Tailwind CSS, TypeScript, `@vitejs/plugin-react`.

No `@typhoon/ui`, `@typhoon/api-client`, or `@typhoon/chat` dependencies -- the widget is fully standalone.

## Cross-References

- [Architecture](../../docs/architecture.md) -- system-wide architecture and how the widget fits in
- [API Reference](../../docs/api-reference.md) -- `/api/v1/widget/chat` endpoint documentation
- [Environment Variables](../../docs/environment-variables.md) -- API key configuration
- [Getting Started](../../docs/getting-started.md) -- first-time setup including widget deployment
