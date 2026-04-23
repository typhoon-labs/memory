# @typhoon/agents

Multi-agent orchestration layer built on Mastra. Provides a supervisor agent that routes queries to specialized agents, with input/output guardrails for security.

## Exports

| Export | Description |
|--------|-------------|
| `createSupervisor()` | Creates a supervisor agent that delegates to specialized agents |
| `createKnowledgeAgent()` | Knowledge base Q&A agent with document search tools |
| `createKnowledgeSearchTool()` | Two-phase search + citation tool wrapping the knowledge agent |
| `searchKnowledgeBase` | Vector similarity search tool |
| `searchKnowledgeBaseHybrid` | Combined vector + full-text search tool |
| `searchKnowledgeBaseGraph` | Graph-based RAG search tool |
| `createInputGuardrails()` | Input processors (prompt injection, moderation) |
| `createOutputGuardrails()` | Output processors (PII detection, content scrubbing) |
| `createRagScorers()` / `runRagEvals()` | RAG evaluation and scoring |
| `emitToolProgress()` / `withProgress()` | Live tool progress streaming to the UI |

## Two-Phase Knowledge Search

The `searchKnowledge` tool uses a two-phase architecture to guarantee both reliable search and inline citations:

1. **Phase 1 (Search):** Calls the knowledge agent with `toolChoice: 'required'`, ensuring it always queries the knowledge base. The agent decides which search tool to use (vector, hybrid, or graph) and constructs appropriate queries.

2. **Phase 2 (Cite):** Takes the search results and makes a separate `generateText()` call to synthesize them into a response with inline `[Source: Document Title — Section]` citations.

This separation is necessary because `toolChoice: 'required'` prevents the knowledge agent from producing a text response (it must call a tool on every step). The Phase 2 call is dedicated to citation formatting with no tool-calling constraints.

## Structure

```
src/
  supervisor.ts        — Supervisor agent factory
  knowledge.ts         — Knowledge agent factory
  tools/
    knowledge-search.ts — Two-phase search + citation tool
    search-kb.ts       — Vector search tool
    search-kb-hybrid.ts — Hybrid search tool
    graph-kb.ts        — Graph RAG tool
    with-progress.ts   — Tool progress emission helpers
  guardrails/
    input.ts           — Input guardrail workflow
    output.ts          — Output guardrail workflow (batch parts processor)
  evals/
    scorers.ts         — RAG evaluation scorers
```

## Dependencies

`@typhoon/ai` (model factories), `@typhoon/config` (env validation), `@typhoon/types` (domain types), `@mastra/core`, `@mastra/rag`, `@mastra/evals`
