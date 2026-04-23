import type { OutputProcessorOrWorkflow, ProcessorWorkflow } from '@mastra/core/processors';
import { BatchPartsProcessor, PIIDetector, ProcessorStepSchema, SystemPromptScrubber } from '@mastra/core/processors';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { createGuardrailModel } from '@typhoon/ai';

/**
 * Replaces BatchPartsProcessor to fix two bugs:
 *
 * 1. flushBatch hardcodes `id: "text-1"` on combined text-delta chunks,
 *    breaking AI SDK v6 which requires text-delta IDs to match a preceding
 *    text-start ID.
 *
 * 2. When a non-text part (e.g. tool-input-start) arrives while text-deltas
 *    are queued, flushBatch returns the combined text and the non-text part
 *    is **dropped**. The client then receives tool-input-delta without a
 *    preceding tool-input-start, causing
 *    "Received tool-input-delta for missing tool call" errors.
 *
 * This implementation batches text-deltas ourselves and defers any non-text
 * part that collides with a flush so it is emitted on the next call.
 */
export function createFixedBatchPartsProcessor(options: { batchSize: number }) {
  const inner = new BatchPartsProcessor(options);
  return {
    ...inner,
    id: inner.id,
    name: inner.name,
    async processOutputStream(args: Parameters<typeof inner.processOutputStream>[0]) {
      const { part, state } = args;
      if (!state._batch) state._batch = [];

      // Track the active text part ID from text-start events
      if (part?.type === 'text-start') {
        state._activeTextId = part.payload?.id;
      }

      // If a non-text part was deferred from a previous flush, emit it now
      // and process the incoming part normally.
      if (state._pendingPart) {
        const pending = state._pendingPart;
        state._pendingPart = undefined;

        if (part?.type === 'text-delta') {
          // Text resumes — batch it so we return to normal flow
          state._batch.push(part);
        } else if (part != null) {
          // Another non-text part — re-defer it
          state._pendingPart = part;
        }

        return pending;
      }

      // text-delta: accumulate in the batch
      if (part?.type === 'text-delta') {
        state._batch.push(part);
        if (state._batch.length >= options.batchSize) {
          return flushTextBatch(state);
        }
        return null; // buffered
      }

      // Non-text part: flush pending text first, then pass through
      if (state._batch.length > 0) {
        const flushed = flushTextBatch(state);
        // Defer the non-text part to the next call
        state._pendingPart = part;
        return flushed;
      }

      // No pending text — pass through directly
      return part;
    },
    // biome-ignore lint/suspicious/noExplicitAny: flush state is untyped in Mastra
    flush(state?: any) {
      if (!state) return null;
      if (state._pendingPart) {
        const pending = state._pendingPart;
        state._pendingPart = undefined;
        return pending;
      }
      if (state._batch?.length > 0) {
        return flushTextBatch(state);
      }
      return null;
    },
  };

  // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped in Mastra
  function flushTextBatch(state: Record<string, any>) {
    const batch = state._batch;
    state._batch = [];
    if (batch.length === 0) return null;
    if (batch.length === 1) {
      const single = batch[0];
      if (single?.type === 'text-delta' && state._activeTextId != null) {
        single.payload.id = state._activeTextId;
      }
      return single ?? null;
    }
    const combinedText = batch
      // biome-ignore lint/suspicious/noExplicitAny: ChunkType payload varies by type
      .map((p: any) => (p.type === 'text-delta' ? p.payload.text : ''))
      .join('');
    return {
      type: 'text-delta' as const,
      payload: { text: combinedText, id: state._activeTextId ?? 'text-1' },
      runId: '1',
      from: 'AGENT',
    };
  }
}

export interface OutputGuardrailsConfig {
  piiDetection?: boolean;
  systemPromptScrubbing?: boolean;
}

const structuredOutputOptions = { jsonPromptInjection: true } as const;

const defaults: OutputGuardrailsConfig = {
  piiDetection: true,
  systemPromptScrubbing: true,
};

export function createOutputGuardrails(
  model: ReturnType<typeof createGuardrailModel>,
  config: OutputGuardrailsConfig = {},
): OutputProcessorOrWorkflow[] {
  const opts = { ...defaults, ...config };

  const steps: ReturnType<typeof createStep>[] = [];
  if (opts.piiDetection) {
    steps.push(
      createStep(
        new PIIDetector({ model, strategy: 'redact', redactionMethod: 'placeholder', structuredOutputOptions }),
      ),
    );
  }
  if (opts.systemPromptScrubbing) {
    steps.push(createStep(new SystemPromptScrubber({ model, strategy: 'redact', structuredOutputOptions })));
  }

  if (steps.length === 0) return [];

  if (steps.length === 1) {
    const workflow = createWorkflow({
      id: 'output-guardrails',
      inputSchema: ProcessorStepSchema,
      outputSchema: ProcessorStepSchema,
    })
      .then(createStep(createFixedBatchPartsProcessor({ batchSize: 10 })))
      // biome-ignore lint/style/noNonNullAssertion: guarded by steps.length === 1
      .then(steps[0]!)
      .commit() as unknown as ProcessorWorkflow;
    return [workflow];
  }

  const workflow = createWorkflow({
    id: 'output-guardrails',
    inputSchema: ProcessorStepSchema,
    outputSchema: ProcessorStepSchema,
  })
    .then(createStep(createFixedBatchPartsProcessor({ batchSize: 10 })))
    .parallel(steps)
    .map(async ({ inputData }) => {
      return opts.piiDetection
        ? inputData['processor:pii-detector']
        : inputData[Object.keys(inputData)[0] as keyof typeof inputData];
    })
    .commit() as unknown as ProcessorWorkflow;
  return [workflow];
}
