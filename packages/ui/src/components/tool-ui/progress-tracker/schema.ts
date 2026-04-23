import { z } from 'zod';

/**
 * One transient sub-progress event emitted from inside a tool's `execute`
 * via Mastra's `context.writer.custom({ type: 'data-tool-progress', ... })`.
 * Surfaces under the parent step as a bullet line.
 */
export const ProgressEventSchema = z.object({
  message: z.string().min(1),
  status: z.enum(['in-progress', 'done', 'failed']).optional(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const ProgressStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed']),
  /** Live transient progress lines collected from `data-tool-progress` parts. */
  progressEvents: z.array(ProgressEventSchema).optional(),
});

export type ProgressStep = z.infer<typeof ProgressStepSchema>;

export interface ProgressTrackerProps {
  id: string;
  steps: ProgressStep[];
  elapsedTime?: number;
  className?: string;
}
