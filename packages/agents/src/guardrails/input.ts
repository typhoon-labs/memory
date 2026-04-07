import type { InputProcessorOrWorkflow, ProcessorWorkflow } from '@mastra/core/processors';
import {
  ModerationProcessor,
  PIIDetector,
  ProcessorStepSchema,
  PromptInjectionDetector,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { createGuardrailModel } from '@typhoon/ai';

export interface InputGuardrailsConfig {
  promptInjection?: boolean;
  moderation?: boolean;
  piiDetection?: boolean;
}

const structuredOutputOptions = { jsonPromptInjection: true } as const;

const defaults: InputGuardrailsConfig = {
  promptInjection: true,
  moderation: true,
  piiDetection: true,
};

export function createInputGuardrails(
  model: ReturnType<typeof createGuardrailModel>,
  config: InputGuardrailsConfig = {},
): InputProcessorOrWorkflow[] {
  const opts = { ...defaults, ...config };
  const processors: InputProcessorOrWorkflow[] = [new TokenLimiterProcessor({ limit: 127_000 })];

  const steps: ReturnType<typeof createStep>[] = [];
  if (opts.promptInjection) {
    steps.push(
      createStep(new PromptInjectionDetector({ model, strategy: 'block', threshold: 0.7, structuredOutputOptions })),
    );
  }
  if (opts.moderation) {
    steps.push(
      createStep(new ModerationProcessor({ model, strategy: 'block', threshold: 0.5, structuredOutputOptions })),
    );
  }
  if (opts.piiDetection) {
    steps.push(
      createStep(
        new PIIDetector({ model, strategy: 'redact', redactionMethod: 'placeholder', structuredOutputOptions }),
      ),
    );
  }

  if (steps.length === 0) return processors;

  if (steps.length === 1) {
    // Single processor — no need for a parallel workflow
    const workflow = createWorkflow({
      id: 'input-guardrails',
      inputSchema: ProcessorStepSchema,
      outputSchema: ProcessorStepSchema,
    })
      .then(createStep(new TokenLimiterProcessor({ limit: 127_000 })))
      // biome-ignore lint/style/noNonNullAssertion: guarded by steps.length === 1
      .then(steps[0]!)
      .commit() as unknown as ProcessorWorkflow;
    return [workflow];
  }

  // Multiple processors — run in parallel
  const workflow = createWorkflow({
    id: 'input-guardrails',
    inputSchema: ProcessorStepSchema,
    outputSchema: ProcessorStepSchema,
  })
    .then(createStep(new TokenLimiterProcessor({ limit: 127_000 })))
    .parallel(steps)
    .map(async ({ inputData }) => {
      // Prefer the redact branch if PII detection is enabled, otherwise take the first result
      return opts.piiDetection
        ? inputData['processor:pii-detector']
        : inputData[Object.keys(inputData)[0] as keyof typeof inputData];
    })
    .commit() as unknown as ProcessorWorkflow;
  return [workflow];
}
