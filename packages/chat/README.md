# @typhoon/chat

React UI components for AI-powered chat threads. Handles message streaming, tool progress visualization, source citations, and markdown rendering.

## Exports

| Export | Description |
|--------|-------------|
| `TyphoonThread` | Full chat thread component with message list and composer |
| `TyphoonComposer` | Message input with submit handling |
| `TyphoonMessage` | Single message with streaming, tool progress, and citations |
| `ChatConfigProvider` / `useChatConfig` | Configuration context for chat behavior |
| `TaskProgress` | Tool execution progress tracker |
| `SourceCitations` | RAG source citation footer with snippets, scores, and document links |
| `CitationProvider` / `useCitations` | Context for inline citation chip rendering |
| `StreamdownText` | Streaming markdown renderer |
| `Conversation`, `Message`, `PromptInput`, `Loader` | Low-level AI chat primitives |

## Structure

```
src/
  components/
    ai-elements/       — Low-level chat primitives (conversation, message, prompt input)
    chat/
      typhoon-message.tsx  — Message component with tool tracking and citations
      typhoon-thread.tsx   — Thread component
      typhoon-composer.tsx — Message input
      message-utils.ts  — Pure helpers (progress events, citations, formatting)
      task-progress.tsx — Tool progress visualization
      source-citations.tsx — Citation rendering
      streamdown-text.tsx  — Streaming markdown
      tool-labels.ts    — Tool display name resolution
      chat-config.tsx   — Configuration context
  lib/
    utils.ts           — Markdown stripping and text utilities
```

## Inline Citation Pipeline

When the `searchKnowledge` tool returns a response with hierarchical `[Source: N.M]` patterns (e.g. `[Source: 1.1]`, `[Source: 2]`):

1. `extractCitations()` — reads `_chunkSources` from tool output (chunk-level, deduped by `chunkId`). Also builds parent citations for multi-chunk documents so `[Source: N]` can reference all chunks from document N.
2. `extractSubAgentTexts()` — extracts the tool's text response (with citation patterns)
3. `transformCitationPatterns()` — converts `[Source: N.M]` (chunk) or `[Source: N]` (document) to `<cite>` tags (also supports legacy `[Source: Title — Section]`)
4. `StreamdownText` renders `<cite>` via `CiteElement` component mapping
5. `CiteElement` looks up rich metadata from `CitationProvider` context
6. `InlineCitationChip` renders an interactive superscript badge with popover

Citations use hierarchical numbering: chunks from the same document share a document number (e.g. `[1.1]`, `[1.2]`), solo chunks use just the document number (`[2]`).

The `SourceCitations` footer groups citations by document with expandable chunk details.

## Dependencies

`@ai-sdk/react`, `ai`, `@typhoon/ui`, `streamdown`, `lucide-react`

**Peer dependencies:** `react`, `react-dom`, `tailwindcss`
