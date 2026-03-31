-- Drop S3-specific columns and add generic sourceType + config JSONB
-- NOTE: DEFAULT 's3' is transitional for existing rows only; new rows must specify sourceType explicitly.
ALTER TABLE "sync_targets" DROP COLUMN IF EXISTS "bucket_name";--> statement-breakpoint
ALTER TABLE "sync_targets" DROP COLUMN IF EXISTS "prefix";--> statement-breakpoint
ALTER TABLE "sync_targets" DROP COLUMN IF EXISTS "region";--> statement-breakpoint
ALTER TABLE "sync_targets" DROP COLUMN IF EXISTS "endpoint";--> statement-breakpoint
ALTER TABLE "sync_targets" ADD COLUMN "source_type" text NOT NULL DEFAULT 's3';--> statement-breakpoint
ALTER TABLE "sync_targets" ADD COLUMN "config" jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
CREATE INDEX "sync_targets_source_type_idx" ON "sync_targets" USING btree ("source_type");
