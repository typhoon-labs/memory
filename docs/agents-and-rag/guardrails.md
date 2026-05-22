# Guardrails

Typhoon applies safety guardrails as input and output processors on the supervisor agent. All guardrails use LLM-based detection via Mastra's processor framework and can be individually enabled or disabled.

## Overview

| Stage  | Processor                 | Strategy   | Default                                  |
| ------ | ------------------------- | ---------- | ---------------------------------------- |
| Input  | Token Limiter             | Hard limit | Always on (127K tokens)                  |
| Input  | Prompt Injection Detector | Block      | Off (`GUARDRAIL_PROMPT_INJECTION`)       |
| Input  | Content Moderation        | Block      | Off (`GUARDRAIL_MODERATION`)             |
| Input  | PII Detector              | Redact     | Off (`GUARDRAIL_PII_DETECTION`)          |
| Output | Batch Parts Processor     | Batching   | Always on (batch size 10)                |
| Output | PII Detector              | Redact     | On (`GUARDRAIL_PII_DETECTION`)           |
| Output | System Prompt Scrubber    | Redact     | On (`GUARDRAIL_SYSTEM_PROMPT_SCRUBBING`) |

## Input Guardrails

**File:** `packages/agents/src/guardrails/input.ts`

Input guardrails run before the agent processes a message. They are composed into a Mastra workflow:

```
Token Limiter -> [Parallel: Prompt Injection, Moderation, PII Detection] -> Merge
```

When only one guardrail is enabled, the parallel step is replaced with a simple chain.

### Token Limiter

Always active. Uses `TokenLimiterProcessor` to reject messages exceeding 127,000 tokens. This protects against context window overflow.

### Prompt Injection Detector

Detects prompt injection attempts using the configured guardrail model.

| Setting           | Value                         |
| ----------------- | ----------------------------- |
| Strategy          | `block` (rejects the message) |
| Threshold         | 0.7                           |
| Structured output | JSON prompt injection enabled |

### Content Moderation

Detects inappropriate, harmful, or unsafe content.

| Setting           | Value                         |
| ----------------- | ----------------------------- |
| Strategy          | `block`                       |
| Threshold         | 0.5                           |
| Structured output | JSON prompt injection enabled |

### PII Detector (Input)

Detects and redacts personally identifiable information from user messages.

| Setting           | Value                                          |
| ----------------- | ---------------------------------------------- |
| Strategy          | `redact`                                       |
| Redaction method  | `placeholder` (replaces PII with `[REDACTED]`) |
| Structured output | JSON prompt injection enabled                  |

When multiple input guardrails run in parallel, the merge step prefers the PII detector's output (which contains redacted text) over other branches.

## Output Guardrails

**File:** `packages/agents/src/guardrails/output.ts`

Output guardrails run after the agent generates a response, processing the streaming output.

```
Batch Parts Processor -> [Parallel: PII Detection, System Prompt Scrubbing] -> Merge
```

### Batch Parts Processor

A fixed implementation of Mastra's `BatchPartsProcessor` that resolves two bugs in the original:

1. Hardcoded `id: "text-1"` on combined text-delta chunks (breaks AI SDK v6 which requires matching IDs)
2. Non-text parts dropped when they collide with a text batch flush (causes "Received tool-input-delta for missing tool call" errors)

The fixed implementation tracks the active text part ID from `text-start` events and defers non-text parts that collide with a flush.

### PII Detector (Output)

Same as the input PII detector but applied to the agent's response. Catches any PII that was generated or echoed.

### System Prompt Scrubber

Detects and redacts any system prompt content that leaks into the agent's response. Uses `SystemPromptScrubber` with `redact` strategy.

## Configuration

Guardrails are configured via environment variables in `apps/api/src/mastra/index.ts`:

| Env Var                             | Default | Processor                      |
| ----------------------------------- | ------- | ------------------------------ |
| `GUARDRAIL_PROMPT_INJECTION`        | `false` | Prompt injection detection     |
| `GUARDRAIL_MODERATION`              | `false` | Content moderation             |
| `GUARDRAIL_PII_DETECTION`           | `false` | PII detection (input + output) |
| `GUARDRAIL_SYSTEM_PROMPT_SCRUBBING` | `true`  | System prompt scrubbing        |

Values: `0`, `false` to disable; any other value or absent to use the default.

## Guardrail Model

All guardrail processors share a model created by `createGuardrailModel()` from `@typhoon/ai`. This reads from:

- **`LLM_GUARDRAIL_MODEL`** -- model ID to use for guardrails
- Falls back to `LLM_CHAT_MODEL` if not set

Point this at a fast, inexpensive model (e.g. Haiku) to minimize latency on every request, since guardrails run on the critical path of every message.

## Enabling/Disabling

To enable all guardrails, set in your `.env`:

```bash
GUARDRAIL_PROMPT_INJECTION=true
GUARDRAIL_MODERATION=true
GUARDRAIL_PII_DETECTION=true
GUARDRAIL_SYSTEM_PROMPT_SCRUBBING=true
```

To disable all guardrails (e.g. for experiments or development):

```bash
GUARDRAIL_PROMPT_INJECTION=false
GUARDRAIL_MODERATION=false
GUARDRAIL_PII_DETECTION=false
GUARDRAIL_SYSTEM_PROMPT_SCRUBBING=false
```

When all processors for a stage are disabled, no workflow is created and the stage is a no-op.

## Related

- [Supervisor](./supervisor.md) -- how guardrails are wired into the agent
- [Memory](./memory.md) -- conversation context that guardrails operate on
