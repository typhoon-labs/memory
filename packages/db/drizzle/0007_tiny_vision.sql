ALTER TABLE "sync_targets" ALTER COLUMN "source_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_targets" ALTER COLUMN "config" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "description" text;