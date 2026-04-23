-- scores table: missing indexes for entity lookups, thread filtering, time ordering
CREATE INDEX IF NOT EXISTS "scores_entity_id_entity_type_idx" ON "scores" USING btree ("entity_id", "entity_type");
CREATE INDEX IF NOT EXISTS "scores_thread_id_idx" ON "scores" USING btree ("thread_id");
CREATE INDEX IF NOT EXISTS "scores_created_at_idx" ON "scores" USING btree ("created_at");

-- ai_spans table: missing indexes for trace hierarchy, thread lookups, time filtering
CREATE INDEX IF NOT EXISTS "ai_spans_parent_span_id_idx" ON "ai_spans" USING btree ("parent_span_id");
CREATE INDEX IF NOT EXISTS "ai_spans_thread_id_idx" ON "ai_spans" USING btree ("thread_id");
CREATE INDEX IF NOT EXISTS "ai_spans_started_at_idx" ON "ai_spans" USING btree ("started_at");

-- experiments table: missing indexes for listing and filtering
CREATE INDEX IF NOT EXISTS "experiments_created_at_idx" ON "experiments" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "experiments_status_idx" ON "experiments" USING btree ("status");

-- experiment_results table: composite for filtered + ordered listing
CREATE INDEX IF NOT EXISTS "experiment_results_experiment_id_created_at_idx" ON "experiment_results" USING btree ("experiment_id", "created_at");

-- datasets table: missing index for listing
CREATE INDEX IF NOT EXISTS "datasets_created_at_idx" ON "datasets" USING btree ("created_at");

-- dataset_items table: composite for soft-delete filtering
CREATE INDEX IF NOT EXISTS "dataset_items_dataset_id_is_deleted_idx" ON "dataset_items" USING btree ("dataset_id", "is_deleted");
