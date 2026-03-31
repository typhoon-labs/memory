CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_target_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"s3_etag" text,
	"mime_type" text,
	"file_size" integer,
	"title" text,
	"author" text,
	"page_count" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_target_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"files_scanned" integer DEFAULT 0 NOT NULL,
	"files_new" integer DEFAULT 0 NOT NULL,
	"files_updated" integer DEFAULT 0 NOT NULL,
	"files_deleted" integer DEFAULT 0 NOT NULL,
	"files_errored" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bucket_name" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"endpoint" text,
	"cron_schedule" text DEFAULT '0 */6 * * *' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sync_target_id_sync_targets_id_fk" FOREIGN KEY ("sync_target_id") REFERENCES "public"."sync_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_sync_target_id_sync_targets_id_fk" FOREIGN KEY ("sync_target_id") REFERENCES "public"."sync_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_sync_target_key_unique_idx" ON "documents" USING btree ("sync_target_id","s3_key");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_sync_target_id_idx" ON "documents" USING btree ("sync_target_id");--> statement-breakpoint
CREATE INDEX "feedback_thread_id_idx" ON "feedback" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "feedback_message_id_idx" ON "feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "feedback_user_id_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_rating_idx" ON "feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "sync_jobs_sync_target_id_idx" ON "sync_jobs" USING btree ("sync_target_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_targets_is_active_idx" ON "sync_targets" USING btree ("is_active");