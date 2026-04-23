ALTER TYPE "public"."sync_job_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "child_jobs_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "child_jobs_completed" integer DEFAULT 0 NOT NULL;