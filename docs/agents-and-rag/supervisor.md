# Supervisor Agent

The supervisor is the top-level agent that handles all user-facing conversations. It routes customer queries to specialized sub-agents and presents their responses faithfully with citations.

## Factory

```typescript
function createSupervisor(
  supervisorMemory: MastraMemory,
  guardrailsOrOptions?: GuardrailsConfig | SupervisorOptions,
): Agent;
```

**Package:** `packages/agents/src/supervisor.ts`

## Configuration

| Setting           | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Agent ID          | `typhoon-supervisor`                                                     |
| Model             | `LLM_CHAT_MODEL` (default: `anthropic.claude-sonnet-4-6` via Bedrock) |
| Temperature       | 0                                                                     |
| Memory            | Last 20 messages, no semantic recall, no working memory               |
| Tools             | `searchKnowledge`, `setThreadTitle`                                   |
| Input processors  | Guardrail workflow (configurable)                                     |
| Output processors | Guardrail workflow (configurable)                                     |
| Error processors  | `PrefillErrorHandler`                                                 |

## Instructions

The supervisor follows strict routing guidelines:

- **Most queries** are delegated to the Knowledge Agent via the `searchKnowledge` composite tool. The user's full message is passed verbatim -- never split or paraphrased.
- **Simple greetings** and meta-questions about itself are answered directly.
- **When in doubt**, it routes to the Knowledge Agent rather than guessing.
- **Responses** preserve all `[Source: N]` citations from the search tool unchanged.
- **Thread titles** are generated on the first message only, via `setThreadTitle` called in parallel with `searchKnowledge`.

## Tools

### `searchKnowledge`

The primary tool -- a composite two-phase knowledge search that returns an answer with inline `[Source: N.M]` citations. See [Search Tools](./search-tools.md) for details.

### `setThreadTitle`

Generates a short title for the conversation thread on the first user message. Uses `LLM_TITLE_MODEL` with structured output to produce a title under 80 characters. Skips if the thread already has a title.

## PrefillErrorHandler

Mastra attempts to prefill the assistant message after tool calls. Bedrock and Bifrost reject this with "does not support assistant message prefill". The `PrefillErrorHandler` error processor catches this specific error and retries by appending a `<system-reminder>continue</system-reminder>` user message.

These synthetic messages are stored with `metadata.systemReminder` and must be filtered out in several places:

| Location       | Filtering                                      |
| -------------- | ---------------------------------------------- |
| Thread API     | `isSystemReminder` check when listing messages |
| Scoring worker | JSONB filter in scoring queries                |
| Chat UI        | Filtered in thread component rendering         |

There is no Mastra configuration to prevent the prefill attempt -- this is a reactive error-recovery pattern.

## Guardrails

The supervisor accepts a `GuardrailsConfig` object to enable or disable individual guardrails:

```typescript
interface GuardrailsConfig {
  promptInjection?: boolean;
  moderation?: boolean;
  piiDetection?: boolean;
  systemPromptScrubbing?: boolean;
}
```

See [Guardrails](./guardrails.md) for details on each processor.

## Metadata Context

The supervisor accepts an optional `getMetadataContext` callback that returns a string describing available metadata fields and values. This context is prepended to the user's query before it reaches the knowledge agent, enabling metadata-aware filtered search.

```typescript
interface SupervisorOptions {
  guardrails?: GuardrailsConfig;
  getMetadataContext?: () => Promise<string | undefined>;
}
```

The callback is configured in the API's Mastra composition root (`apps/api/src/mastra/index.ts`) with a 60-second TTL cache backed by `MetadataRepo.getFieldValuesForAgent()`.

## Extensibility

The supervisor's routing architecture is designed to support additional sub-agents in the future. Currently only the Knowledge Agent exists, but the instructions and tool structure allow adding more specialized agents (e.g. a Ticketing Agent) by:

1. Creating a new agent in `packages/agents/src/`
2. Creating a composite tool that wraps the agent (following the `createKnowledgeSearchTool` pattern)
3. Adding the tool to the supervisor's tool set
4. Updating the supervisor instructions with routing guidelines for the new agent

## Related

- [Knowledge Agent](./knowledge-agent.md)
- [Guardrails](./guardrails.md)
- [Memory](./memory.md)
