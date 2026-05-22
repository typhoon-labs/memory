# Scorers

## Overview

Scorers evaluate agent response quality on a 0-1 scale. Typhoon includes five prebuilt RAG scorers from Mastra and supports custom LLM-as-judge scorers defined via the admin UI.

## Prebuilt Scorers

### Response Quality

These scorers evaluate the agent's answer regardless of whether retrieval context exists.

| Scorer           | Type              | Measures                                     | Scale                 | Notes                                    |
| ---------------- | ----------------- | -------------------------------------------- | --------------------- | ---------------------------------------- |
| Answer Relevancy | `answerRelevancy` | Does the answer address the user's question? | 0-1 (higher = better) | Does not require context                 |
| Faithfulness     | `faithfulness`    | Is the answer grounded in retrieved context? | 0-1 (higher = better) | Accepts empty context (scores grounding) |
| Hallucination    | `hallucination`   | Does the answer contain unsupported claims?  | 0-1 (higher = worse)  | Inverted (1 - score) before averaging    |

### Retrieval Quality

These scorers evaluate the retrieval pipeline and require non-empty context. They are skipped when no documents were retrieved.

| Scorer            | Type               | Measures                                        | Scale                 |
| ----------------- | ------------------ | ----------------------------------------------- | --------------------- |
| Context Relevance | `contextRelevance` | Are the retrieved chunks relevant to the query? | 0-1 (higher = better) |
| Context Precision | `contextPrecision` | Are relevant chunks ranked higher in results?   | 0-1 (higher = better) |

### Why Response Quality Always Runs

Running faithfulness and hallucination scorers even with empty context produces a meaningful signal: if the agent generated an answer without grounding it in retrieved documents, low faithfulness is expected and highlights responses that should have used RAG but did not.

### Hallucination Inversion

The hallucination scorer uses an inverted scale (1.0 = maximum hallucination). For category averaging, the score is inverted (`1 - score`) so that it aligns with the "higher = better" convention used by the other response quality scorers.

## Custom Scorers (LLM-as-Judge)

Administrators can create custom scorers via the admin UI. Custom scorers use the LLM-as-judge pattern:

### Definition

Each custom scorer has:

- **Name** -- unique identifier
- **Instructions** -- evaluation criteria prompt (what to score and how)
- **Model** -- which LLM to use for judging (defaults to `LLM_SCORING_MODEL`)
- **Score range** -- min/max/step configuration

### Construction

Custom scorers are constructed at runtime using Mastra's `createScorer()` API:

1. A `generateScore` step creates a prompt from the scorer's instructions, the user input, and the agent output.
2. A `generateReason` step explains the assigned score in 1-2 sentences.

Custom scorers are displayed separately in the UI and excluded from category averages.

### Lifecycle

Scorer definitions follow a publish lifecycle:

| Status     | Description                                               |
| ---------- | --------------------------------------------------------- |
| `draft`    | Work in progress. Not used for scoring.                   |
| `active`   | Published and used for automated reviews and experiments. |
| `archived` | Removed from active use. Historical scores are preserved. |

### Preview

Scorers can be tested against sample data before publishing. The preview runs the scorer against a provided input/output pair and returns the score and reasoning without persisting results.

### Version Management

Scorer definitions support versioning. When a scorer's instructions or configuration change, a new version is created. Historical scores reference the version that was active when they were generated.

## LLM Model

By default, all scorers use the system default model (`LLM_SCORING_MODEL`) for evaluation. This is typically a fast, cost-efficient model (e.g., Haiku) since scoring prompts are structured and deterministic.

### Model Pinning

Individual scorers can be pinned to a specific model via the admin UI model selector on the scorer detail page. Pinned scorers always use their configured model regardless of changes to `LLM_SCORING_MODEL`.

**Configuration:**

| Env Var                     | Default                     | Description                                                              |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `LLM_SCORING_MODEL`        | `claude-haiku-4-5-20251001` | System default model for all unpinned scorers                            |
| `LLM_SCORING_MODEL_OPTIONS` | --                         | Comma-separated model IDs available in the UI dropdown (e.g., `claude-haiku-4-5-20251001,claude-sonnet-4-20250514`) |

**How pinning works:**

1. The scorer's `model` field (JSONB) stores `{ id: "model-id" }` when pinned, or `null` when using the system default
2. `constructScorer()` in `@typhoon/evals` calls `extractModelId(definition.model)` which reads `model.id` or `model.name`
3. If a pinned model ID is found, the model factory is called with that ID; otherwise it falls back to `LLM_SCORING_MODEL`

**Unavailable model warnings:**

- If a pinned model is later removed from `LLM_SCORING_MODEL_OPTIONS`, the scorer list page shows an amber warning icon with tooltip "Pinned model is no longer available"
- The scorer continues to function (the model may still be available at the provider level) -- the warning is informational only
- To resolve, either re-add the model to `LLM_SCORING_MODEL_OPTIONS` or change the scorer's pinned model

## Scorer Construction

The `constructScorer()` function in `@typhoon/evals` maps a database-stored `ScorerDefinitionVersion` to a runnable Mastra scorer. It accepts a `ModelFactory` (`(modelId?: string) => MastraModelConfig`) instead of a pre-built model — when a definition has a pinned model (`definition.model.id`), the factory is called with that ID; otherwise it falls back to the system default.

- For prebuilt types (`faithfulness`, `hallucination`, `answerRelevancy`, `contextRelevance`, `contextPrecision`), it delegates to the corresponding factory from `@mastra/evals/scorers/prebuilt`.
- For custom types, it builds an LLM-as-judge scorer via `createScorer()`.
- Context-dependent scorers (retrieval quality) return `null` when context is empty, causing them to be skipped.

## Key Files

- `packages/evals/src/scorers.ts` -- `createRagScorers()` prebuilt factory
- `packages/evals/src/scorer-categories.ts` -- category mapping, inversion, averaging
- `packages/evals/src/scorer-loader.ts` -- `constructScorer()`, custom scorer construction
- `packages/evals/src/handle-scoring-job.ts` -- `BUILTIN_SCORER_DEFS`, `runSingleScorer()`
