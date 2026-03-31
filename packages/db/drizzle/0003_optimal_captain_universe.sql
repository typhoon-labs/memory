CREATE TYPE "public"."document_status" AS ENUM('pending', 'processing', 'ready', 'parse_error', 'embed_error', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_rating" AS ENUM('positive', 'negative');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_sync_target_id_sync_targets_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_jobs" DROP CONSTRAINT "sync_jobs_sync_target_id_sync_targets_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "last_refill_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "last_request" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "ban_expires" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dataset_items" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "dataset_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "dataset_items" ALTER COLUMN "dataset_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "dataset_versions" ALTER COLUMN "dataset_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "datasets" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "datasets" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."document_status";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE "public"."document_status" USING "status"::"public"."document_status";--> statement-breakpoint
ALTER TABLE "experiment_results" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "experiment_results" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "experiment_results" ALTER COLUMN "experiment_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "experiments" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "experiments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "experiments" ALTER COLUMN "status" SET DATA TYPE "public"."experiment_status" USING "status"::"public"."experiment_status";--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "thread_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "message_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "rating" SET DATA TYPE "public"."feedback_rating" USING "rating"::"public"."feedback_rating";--> statement-breakpoint
ALTER TABLE "agent_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "agent_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "agent_versions" ALTER COLUMN "agent_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "ai_spans" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "ai_spans" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mcp_client_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_client_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mcp_client_versions" ALTER COLUMN "mcp_client_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_server_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_server_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mcp_server_versions" ALTER COLUMN "mcp_server_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "thread_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "resource_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "prompt_block_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "prompt_block_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "prompt_block_versions" ALTER COLUMN "block_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "prompt_blocks" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "scorer_definition_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scorer_definition_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "scorer_definition_versions" ALTER COLUMN "scorer_definition_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scorer_definitions" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "skill_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "sync_jobs" ALTER COLUMN "status" SET DEFAULT 'running'::"public"."sync_job_status";--> statement-breakpoint
ALTER TABLE "sync_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."sync_job_status" USING "status"::"public"."sync_job_status";--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "resource_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspace_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspace_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "workspace_versions" ALTER COLUMN "workspace_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "status" SET DATA TYPE "public"."entity_status" USING "status"::"public"."entity_status";--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "active_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "author_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workflow_snapshots" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sync_target_id_sync_targets_id_fk" FOREIGN KEY ("sync_target_id") REFERENCES "public"."sync_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_client_versions" ADD CONSTRAINT "mcp_client_versions_mcp_client_id_mcp_clients_id_fk" FOREIGN KEY ("mcp_client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server_versions" ADD CONSTRAINT "mcp_server_versions_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_block_versions" ADD CONSTRAINT "prompt_block_versions_block_id_prompt_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."prompt_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorer_definition_versions" ADD CONSTRAINT "scorer_definition_versions_scorer_definition_id_scorer_definitions_id_fk" FOREIGN KEY ("scorer_definition_id") REFERENCES "public"."scorer_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_sync_target_id_sync_targets_id_fk" FOREIGN KEY ("sync_target_id") REFERENCES "public"."sync_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_versions" ADD CONSTRAINT "workspace_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_thread_message_idx" ON "feedback" USING btree ("thread_id","message_id");--> statement-breakpoint
CREATE INDEX "threads_metadata_gin_idx" ON "threads" USING gin ("metadata");--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_key_unique" UNIQUE("key");