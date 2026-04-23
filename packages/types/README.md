# @typhoon/types

Shared type definitions and Zod schemas for domain models. Used across packages for consistent runtime validation and TypeScript types.

## Exports

**Documents:**
`Document`, `DocumentStatus`, `documentSchema`, `documentStatusEnum`

**Feedback:**
`Feedback`, `FeedbackRating`, `createFeedbackSchema`, `feedbackSchema`, `feedbackRatingEnum`

**Sync Jobs:**
`SyncJob`, `SyncJobStatus`, `syncJobSchema`, `syncJobStatusEnum`

**Sync Targets:**
`SyncTarget`, `CreateSyncTarget`, `UpdateSyncTarget`, `syncTargetSchema`, `createSyncTargetSchema`, `updateSyncTargetSchema`, `syncTargetConfigSchemas`

All types are inferred from Zod schemas (`z.infer<typeof schema>`), so runtime validation and TypeScript types stay in sync.

## Dependencies

`@typhoon/config`, `zod`
