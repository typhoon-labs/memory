import { z } from 'zod';

const CRON_5FIELD = /^(\S+\s+){4}\S+$/;
const cronSchedule = z
  .string()
  .default('0 */6 * * *')
  .refine((v) => CRON_5FIELD.test(v), { message: 'Must be a 5-field cron expression' });

// =============================================================================
// Per-source-type config schemas
// =============================================================================

const s3ConfigSchema = z
  .object({
    bucket: z.string().min(1),
    prefix: z.string().default(''),
  })
  .strict();

export const syncTargetConfigSchemas: { s3: z.ZodType } & Record<string, z.ZodType | undefined> = {
  s3: s3ConfigSchema,
};

// =============================================================================
// Sync target (DB row)
// =============================================================================

export const syncTargetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sourceType: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  cronSchedule,
  isActive: z.boolean().default(true),
  managedBy: z.enum(['config', 'manual']).nullable().default(null),
  source: z.string().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SyncTarget = z.infer<typeof syncTargetSchema>;

export const createSyncTargetSchema = syncTargetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateSyncTarget = z.infer<typeof createSyncTargetSchema>;

export const updateSyncTargetSchema = createSyncTargetSchema.partial();

export type UpdateSyncTarget = z.infer<typeof updateSyncTargetSchema>;

// =============================================================================
// Config-defined sync target (used in registerSyncTarget)
// =============================================================================

export const configSyncTargetSchema = z.object({
  name: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  config: z.record(z.string(), z.unknown()),
  cronSchedule,
  isActive: z.boolean().default(true),
});

export type ConfigSyncTarget = z.infer<typeof configSyncTargetSchema>;
export type ConfigSyncTargetInput = z.input<typeof configSyncTargetSchema>;
