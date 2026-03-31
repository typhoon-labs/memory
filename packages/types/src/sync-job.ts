import { z } from 'zod';

export const syncJobStatusEnum = z.enum(['running', 'completed', 'failed']);

export type SyncJobStatus = z.infer<typeof syncJobStatusEnum>;

export const syncJobSchema = z.object({
  id: z.string().uuid(),
  syncTargetId: z.string().uuid(),
  status: syncJobStatusEnum.default('running'),
  filesScanned: z.number().int().default(0),
  filesNew: z.number().int().default(0),
  filesUpdated: z.number().int().default(0),
  filesDeleted: z.number().int().default(0),
  filesErrored: z.number().int().default(0),
  errorMessage: z.string().nullable().default(null),
  startedAt: z.date(),
  completedAt: z.date().nullable().default(null),
});

export type SyncJob = z.infer<typeof syncJobSchema>;
