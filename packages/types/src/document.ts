import { z } from 'zod';

export const documentStatusEnum = z.enum(['pending', 'processing', 'ready', 'error', 'deleted']);

export type DocumentStatus = z.infer<typeof documentStatusEnum>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  syncTargetId: z.string().uuid(),
  sourceKey: z.string().min(1),
  sourceEtag: z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  fileSize: z.number().int().nullable().default(null),
  title: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  pageCount: z.number().int().nullable().default(null),
  status: documentStatusEnum.default('pending'),
  errorMessage: z.string().nullable().default(null),
  chunkCount: z.number().int().default(0),
  customMetadata: z.record(z.string(), z.unknown()).default({}),
  contentHash: z.string().nullable().default(null),
  lastSyncedAt: z.date().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Document = z.infer<typeof documentSchema>;
