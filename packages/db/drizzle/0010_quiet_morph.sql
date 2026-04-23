CREATE TABLE "failed_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"job_name" text NOT NULL,
	"job_id" text NOT NULL,
	"data" jsonb,
	"failed_reason" text,
	"stacktrace" text,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"sync_target_id" uuid,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "failed_jobs_queue_idx" ON "failed_jobs" USING btree ("queue");--> statement-breakpoint
CREATE INDEX "failed_jobs_sync_target_id_idx" ON "failed_jobs" USING btree ("sync_target_id");--> statement-breakpoint
CREATE INDEX "failed_jobs_created_at_idx" ON "failed_jobs" USING btree ("created_at");