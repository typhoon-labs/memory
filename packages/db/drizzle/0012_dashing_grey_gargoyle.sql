CREATE TABLE IF NOT EXISTS "metadata_field_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_field_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"field_group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "custom_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_targets" ADD COLUMN IF NOT EXISTS "metadata_template_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_targets" ADD COLUMN IF NOT EXISTS "auto_extract_metadata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_targets" ADD CONSTRAINT "sync_targets_metadata_template_id_metadata_templates_id_fk" FOREIGN KEY ("metadata_template_id") REFERENCES "public"."metadata_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_items_dataset_id_is_deleted_idx" ON "dataset_items" USING btree ("dataset_id","is_deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datasets_created_at_idx" ON "datasets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_custom_metadata_idx" ON "documents" USING gin ("custom_metadata");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiment_results_experiment_id_created_at_idx" ON "experiment_results" USING btree ("experiment_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_created_at_idx" ON "experiments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spans_parent_span_id_idx" ON "ai_spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spans_thread_id_idx" ON "ai_spans" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spans_started_at_idx" ON "ai_spans" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scores_entity_id_entity_type_idx" ON "scores" USING btree ("entity_id","entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scores_thread_id_idx" ON "scores" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scores_created_at_idx" ON "scores" USING btree ("created_at");
