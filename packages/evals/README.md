# @typhoon/evals

Evaluation and scoring infrastructure for RAG quality assessment. Provides scorer category config, scorer construction from database definitions, and job handlers for both review scoring and experiment execution.

## Scorer Categories

Scorers are split into two categories with independent averages:

- **Response Quality** (always runs): `answerRelevancy`, `faithfulness`, `hallucination`
- **Retrieval Quality** (requires context): `contextRelevance`, `contextPrecision`

Hallucination uses an inverted scale (1.0 = bad). It is inverted (`1 - score`) before inclusion in the Response Quality average. Custom scorers are excluded from category averages.

## Exports

| Export | Description |
|--------|-------------|
| `SCORER_CATEGORIES` / `computeCategoryAverages()` | Scorer category config and grouped average computation |
| `normalizeScoreForAvg()` | Score normalization (inverts hallucination) |
| `RETRIEVAL_SCORERS` | Set of scorer types that require non-empty context |
| `constructScorer()` / `mapScorerRows()` | Construct Mastra scorers from database definitions |
| `prepareScoring()` / `runSingleScorer()` | Score preparation and per-scorer execution for BullMQ fan-out |
| `setupExperiment()` / `processExperimentItemStep1/2()` / `completeExperiment()` | Experiment lifecycle handlers |
| `extractScoringData()` | Extract scoring content from message JSONB |
| `createRagScorers()` / `runRagEvals()` | RAG evaluation scorers and runner |

## Dependencies

`@mastra/core`, `@mastra/evals`, `@typhoon/ai` (model factories), `@typhoon/logger`, `@typhoon/types`
