import { index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const scores = pgTable(
  'scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scorerId: text('scorer_id'),
    traceId: text('trace_id'),
    spanId: text('span_id'),
    runId: text('run_id'),
    scorer: jsonb('scorer').$type<Record<string, unknown>>(),
    preprocessStepResult: jsonb('preprocess_step_result').$type<Record<string, unknown>>(),
    extractStepResult: jsonb('extract_step_result').$type<Record<string, unknown>>(),
    analyzeStepResult: jsonb('analyze_step_result').$type<Record<string, unknown>>(),
    score: real('score'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    preprocessPrompt: text('preprocess_prompt'),
    extractPrompt: text('extract_prompt'),
    generateScorePrompt: text('generate_score_prompt'),
    generateReasonPrompt: text('generate_reason_prompt'),
    analyzePrompt: text('analyze_prompt'),
    reasonPrompt: text('reason_prompt'),
    input: jsonb('input'),
    output: jsonb('output'),
    additionalContext: jsonb('additional_context').$type<Record<string, unknown>>(),
    requestContext: jsonb('request_context').$type<Record<string, unknown>>(),
    entityType: text('entity_type'),
    entity: jsonb('entity').$type<Record<string, unknown>>(),
    entityId: text('entity_id'),
    source: text('source'),
    resourceId: text('resource_id'),
    threadId: text('thread_id'),
    structuredOutput: text('structured_output'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('scores_scorer_id_idx').on(table.scorerId),
    index('scores_run_id_idx').on(table.runId),
    index('scores_trace_id_span_id_idx').on(table.traceId, table.spanId),
  ],
);
