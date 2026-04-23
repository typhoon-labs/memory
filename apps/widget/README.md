# @typhoon/widget

Embeddable customer support chat widget. Builds to a single JavaScript file that can be dropped into any website via a script tag.

## Usage

```html
<script
  src="https://your-domain.com/widget.js"
  data-typhoon-api-key="sk_..."
  data-typhoon-server="https://api.your-domain.com"
  data-typhoon-title="Support"
  data-typhoon-theme="auto"
></script>
```

## Configuration

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-typhoon-api-key` | Yes | — | API key for authentication |
| `data-typhoon-server` | Yes | — | Server base URL |
| `data-typhoon-title` | No | `Typhoon Support` | Widget header title |
| `data-typhoon-theme` | No | `auto` | Theme: `light`, `dark`, or `auto` |

## How It Works

1. Script reads configuration from its own `<script>` tag attributes
2. Creates/reuses a thread ID stored in `localStorage` (scoped per API key)
3. Renders a floating toggle button and chat popup
4. Sends messages to `/api/v1/widget/chat` with `X-API-Key` header
5. Streams responses via the Vercel AI SDK

## Building

```bash
bun run build   # Produces a single JS bundle with inlined styles
```

## Dependencies

`@ai-sdk/react`, `ai`, `react`

CSS is scoped with `typhoon-` prefix to avoid conflicts with host page styles.
