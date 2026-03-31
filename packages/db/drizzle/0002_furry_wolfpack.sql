CREATE TABLE "skill_blobs" (
	"hash" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_items" (
	"id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"dataset_version" integer NOT NULL,
	"valid_to" integer,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"input" jsonb NOT NULL,
	"ground_truth" jsonb,
	"request_context" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_items_id_dataset_version_pk" PRIMARY KEY("id","dataset_version")
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"input_schema" jsonb,
	"ground_truth_schema" jsonb,
	"request_context_schema" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"item_id" text NOT NULL,
	"item_dataset_version" integer,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"ground_truth" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"metadata" jsonb,
	"dataset_id" text,
	"dataset_version" integer,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"model" jsonb NOT NULL,
	"tools" jsonb,
	"default_options" jsonb,
	"workflows" jsonb,
	"agents" jsonb,
	"integration_tools" jsonb,
	"input_processors" jsonb,
	"output_processors" jsonb,
	"memory" jsonb,
	"scorers" jsonb,
	"mcp_clients" jsonb,
	"request_context_schema" jsonb,
	"workspace" jsonb,
	"skills" jsonb,
	"skills_format" text,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_spans" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"scope" jsonb,
	"span_type" text NOT NULL,
	"is_event" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"attributes" jsonb,
	"metadata" jsonb,
	"links" jsonb,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"tags" jsonb,
	"entity_type" text,
	"entity_id" text,
	"entity_name" text,
	"parent_entity_type" text,
	"parent_entity_id" text,
	"parent_entity_name" text,
	"root_entity_type" text,
	"root_entity_id" text,
	"root_entity_name" text,
	"run_id" text,
	"thread_id" text,
	"resource_id" text,
	"request_context" jsonb,
	"source" text,
	"user_id" text,
	"organization_id" text,
	"session_id" text,
	"request_id" text,
	"environment" text,
	"service_name" text,
	"experiment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_client_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"mcp_client_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"servers" jsonb NOT NULL,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_server_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"mcp_server_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"instructions" text,
	"repository" jsonb,
	"release_date" text,
	"is_latest" boolean,
	"package_canonical" text,
	"tools" jsonb,
	"agents" jsonb,
	"workflows" jsonb,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_block_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"block_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"rules" jsonb,
	"request_context_schema" jsonb,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorer_definition_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"scorer_definition_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"model" jsonb,
	"instructions" text,
	"score_range" jsonb,
	"preset_config" jsonb,
	"default_sampling" jsonb,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorer_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" text PRIMARY KEY NOT NULL,
	"scorer_id" text,
	"trace_id" text,
	"span_id" text,
	"run_id" text,
	"scorer" jsonb,
	"preprocess_step_result" jsonb,
	"extract_step_result" jsonb,
	"analyze_step_result" jsonb,
	"score" real,
	"reason" text,
	"metadata" jsonb,
	"preprocess_prompt" text,
	"extract_prompt" text,
	"generate_score_prompt" text,
	"generate_reason_prompt" text,
	"analyze_prompt" text,
	"reason_prompt" text,
	"input" jsonb,
	"output" jsonb,
	"additional_context" jsonb,
	"request_context" jsonb,
	"entity_type" text,
	"entity" jsonb,
	"entity_id" text,
	"source" text,
	"resource_id" text,
	"thread_id" text,
	"structured_output" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"license" text,
	"compatibility" jsonb,
	"source" jsonb,
	"references" jsonb,
	"scripts" jsonb,
	"assets" jsonb,
	"metadata" jsonb,
	"tree" jsonb,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_snapshots" (
	"workflow_name" text NOT NULL,
	"run_id" text NOT NULL,
	"resource_id" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_snapshots_name_run_idx" UNIQUE("workflow_name","run_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filesystem" jsonb,
	"sandbox" jsonb,
	"mounts" jsonb,
	"search" jsonb,
	"skills" jsonb,
	"tools" jsonb,
	"auto_sync" boolean,
	"operation_timeout" integer,
	"changed_fields" jsonb,
	"change_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dataset_items_dataset_id_idx" ON "dataset_items" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_id_idx" ON "experiment_results" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "ai_spans_trace_id_idx" ON "ai_spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "ai_spans_name_started_at_idx" ON "ai_spans" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX "ai_spans_entity_type_entity_id_idx" ON "ai_spans" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_spans_run_id_idx" ON "ai_spans" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "scores_scorer_id_idx" ON "scores" USING btree ("scorer_id");--> statement-breakpoint
CREATE INDEX "scores_run_id_idx" ON "scores" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "scores_trace_id_span_id_idx" ON "scores" USING btree ("trace_id","span_id");