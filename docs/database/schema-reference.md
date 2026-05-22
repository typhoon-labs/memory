# Schema Reference

Complete column-level documentation for every table in the Typhoon database. Tables are grouped by category. All timestamps use `timestamptz` (with timezone). UUIDs are auto-generated via `gen_random_uuid()` unless noted.

## Enums

| Enum                | Values                                               | Used By                 |
| ------------------- | ---------------------------------------------------- | ----------------------- |
| `document_status`   | `pending`, `processing`, `ready`, `error`, `deleted` | `documents.status`      |
| `sync_job_status`   | `running`, `completed`, `failed`, `cancelled`        | `sync_jobs.status`      |
| `feedback_rating`   | `positive`, `negative`                               | `feedback.rating`       |
| `experiment_status` | `pending`, `running`, `completed`, `failed`          | `experiments.status`    |
| `entity_status`     | `draft`, `active`, `archived`                        | Versioned entity tables |

---

## Auth Tables

### `user`

| Column           | Type        | Nullable | Default             | Notes               |
| ---------------- | ----------- | -------- | ------------------- | ------------------- |
| `id`             | uuid        | no       | `gen_random_uuid()` | PK                  |
| `name`           | text        | no       |                     |                     |
| `email`          | text        | no       |                     | Unique              |
| `email_verified` | boolean     | no       | `false`             |                     |
| `image`          | text        | yes      |                     | Avatar URL          |
| `role`           | text        | yes      |                     | e.g. `admin`, `rep` |
| `banned`         | boolean     | yes      | `false`             |                     |
| `ban_reason`     | text        | yes      |                     |                     |
| `ban_expires`    | timestamptz | yes      |                     |                     |
| `created_at`     | timestamptz | no       | `now()`             |                     |
| `updated_at`     | timestamptz | no       | `now()`             | Auto-updates        |

**Relations:** `user` -> many `session`, many `account`

### `session`

| Column            | Type        | Nullable | Default             | Notes                            |
| ----------------- | ----------- | -------- | ------------------- | -------------------------------- |
| `id`              | uuid        | no       | `gen_random_uuid()` | PK                               |
| `expires_at`      | timestamptz | no       |                     |                                  |
| `token`           | text        | no       |                     | Unique                           |
| `ip_address`      | text        | yes      |                     |                                  |
| `user_agent`      | text        | yes      |                     |                                  |
| `user_id`         | uuid        | no       |                     | FK -> `user.id` (cascade delete) |
| `impersonated_by` | text        | yes      |                     |                                  |
| `created_at`      | timestamptz | no       | `now()`             |                                  |
| `updated_at`      | timestamptz | no       |                     | Auto-updates                     |

**Indexes:** `session_user_id_idx` on `user_id`

### `account`

| Column                     | Type        | Nullable | Default             | Notes                            |
| -------------------------- | ----------- | -------- | ------------------- | -------------------------------- |
| `id`                       | uuid        | no       | `gen_random_uuid()` | PK                               |
| `account_id`               | text        | no       |                     | Provider-specific account ID     |
| `provider_id`              | text        | no       |                     | e.g. `oidc`                      |
| `user_id`                  | uuid        | no       |                     | FK -> `user.id` (cascade delete) |
| `access_token`             | text        | yes      |                     |                                  |
| `refresh_token`            | text        | yes      |                     |                                  |
| `id_token`                 | text        | yes      |                     |                                  |
| `access_token_expires_at`  | timestamptz | yes      |                     |                                  |
| `refresh_token_expires_at` | timestamptz | yes      |                     |                                  |
| `scope`                    | text        | yes      |                     |                                  |
| `password`                 | text        | yes      |                     |                                  |
| `created_at`               | timestamptz | no       | `now()`             |                                  |
| `updated_at`               | timestamptz | no       |                     | Auto-updates                     |

**Indexes:** `account_user_id_idx` on `user_id`

### `apikey`

| Column                   | Type        | Nullable | Default             | Notes                           |
| ------------------------ | ----------- | -------- | ------------------- | ------------------------------- |
| `id`                     | uuid        | no       | `gen_random_uuid()` | PK                              |
| `config_id`              | text        | no       | `'default'`         |                                 |
| `name`                   | text        | yes      |                     | Display name                    |
| `start`                  | text        | yes      |                     | Key prefix preview              |
| `reference_id`           | text        | no       |                     | Links to user or entity         |
| `prefix`                 | text        | yes      |                     |                                 |
| `key`                    | text        | no       |                     | Unique, hashed key              |
| `refill_interval`        | integer     | yes      |                     | Rate limit refill interval (ms) |
| `refill_amount`          | integer     | yes      |                     | Tokens refilled per interval    |
| `last_refill_at`         | timestamptz | yes      |                     |                                 |
| `enabled`                | boolean     | yes      | `true`              |                                 |
| `rate_limit_enabled`     | boolean     | yes      | `true`              |                                 |
| `rate_limit_time_window` | integer     | yes      | `86400000`          | Window in ms (default 24h)      |
| `rate_limit_max`         | integer     | yes      | `10`                | Max requests per window         |
| `request_count`          | integer     | yes      | `0`                 |                                 |
| `remaining`              | integer     | yes      |                     | Remaining quota                 |
| `last_request`           | timestamptz | yes      |                     |                                 |
| `expires_at`             | timestamptz | yes      |                     |                                 |
| `permissions`            | text        | yes      |                     |                                 |
| `metadata`               | text        | yes      |                     |                                 |
| `created_at`             | timestamptz | no       |                     |                                 |
| `updated_at`             | timestamptz | no       |                     | Auto-updates                    |

**Indexes:** `apikey_config_id_idx`, `apikey_reference_id_idx`, `apikey_key_idx`

---

## Content Tables

### `sync_targets`

Defines where Typhoon pulls source documents from. The `source` column references a named source in the source registry (which holds bucket and credentials). The sync target only adds a `prefix`.

| Column                  | Type        | Nullable | Default             | Notes                                              |
| ----------------------- | ----------- | -------- | ------------------- | -------------------------------------------------- |
| `id`                    | uuid        | no       | `gen_random_uuid()` | PK                                                 |
| `name`                  | text        | no       |                     |                                                    |
| `source_type`           | text        | no       |                     | e.g. `s3`                                          |
| `config`                | jsonb       | no       |                     | Source-specific config (S3: `{ prefix }`)          |
| `cron_schedule`         | text        | no       | `'0 */6 * * *'`     | Sync cron expression                               |
| `is_active`             | boolean     | no       | `true`              |                                                    |
| `managed_by`            | text        | yes      |                     | `null` for manual targets                          |
| `source`                | text        | yes      |                     | Named source from source registry                  |
| `metadata_template_id`  | uuid        | yes      |                     | FK -> `metadata_templates.id` (set null on delete) |
| `auto_extract_metadata` | boolean     | no       | `false`             | LLM extraction during ingestion                    |
| `created_at`            | timestamptz | no       | `now()`             |                                                    |
| `updated_at`            | timestamptz | no       | `now()`             | Auto-updates                                       |

**Indexes:** `sync_targets_is_active_idx`, `sync_targets_source_type_idx`, `sync_targets_name_managed_by_idx` (unique, uses `COALESCE(managed_by, 'manual')`)

### `documents`

Tracks every document ingested from a sync target.

| Column            | Type            | Nullable | Default             | Notes                                    |
| ----------------- | --------------- | -------- | ------------------- | ---------------------------------------- |
| `id`              | uuid            | no       | `gen_random_uuid()` | PK                                       |
| `sync_target_id`  | uuid            | no       |                     | FK -> `sync_targets.id` (cascade delete) |
| `source_key`      | text            | no       |                     | S3 object key                            |
| `source_etag`     | text            | yes      |                     | S3 ETag for change detection             |
| `mime_type`       | text            | yes      |                     |                                          |
| `file_size`       | integer         | yes      |                     | Bytes                                    |
| `title`           | text            | yes      |                     | Extracted or LLM-generated               |
| `description`     | text            | yes      |                     | LLM-generated                            |
| `author`          | text            | yes      |                     |                                          |
| `page_count`      | integer         | yes      |                     |                                          |
| `status`          | document_status | no       | `'pending'`         | Lifecycle state                          |
| `error_message`   | text            | yes      |                     | Set when status = `error`                |
| `chunk_count`     | integer         | no       | `0`                 | Number of vector chunks                  |
| `custom_metadata` | jsonb           | no       | `'{}'`              | Template-validated metadata              |
| `content_hash`    | text            | yes      |                     |                                          |
| `search_meta_dirty` | boolean       | no       | `false`             | Search index stale after metadata field changes |
| `last_synced_at`  | timestamptz     | yes      |                     |                                          |
| `created_at`      | timestamptz     | no       | `now()`             |                                          |
| `updated_at`      | timestamptz     | no       | `now()`             | Auto-updates                             |

**Indexes:** `documents_sync_target_key_unique_idx` (unique on `sync_target_id, source_key`), `documents_status_idx`, `documents_sync_target_id_idx`, `documents_custom_metadata_idx` (GIN)

### `sync_jobs`

Tracks individual sync runs for a target.

| Column                 | Type            | Nullable | Default             | Notes                                    |
| ---------------------- | --------------- | -------- | ------------------- | ---------------------------------------- |
| `id`                   | uuid            | no       | `gen_random_uuid()` | PK                                       |
| `sync_target_id`       | uuid            | no       |                     | FK -> `sync_targets.id` (cascade delete) |
| `status`               | sync_job_status | no       | `'running'`         |                                          |
| `files_scanned`        | integer         | no       | `0`                 |                                          |
| `files_new`            | integer         | no       | `0`                 |                                          |
| `files_updated`        | integer         | no       | `0`                 |                                          |
| `files_deleted`        | integer         | no       | `0`                 |                                          |
| `files_errored`        | integer         | no       | `0`                 |                                          |
| `child_jobs_total`     | integer         | no       | `0`                 | BullMQ child jobs enqueued               |
| `child_jobs_completed` | integer         | no       | `0`                 | BullMQ child jobs finished               |
| `error_message`        | text            | yes      |                     |                                          |
| `started_at`           | timestamptz     | no       | `now()`             |                                          |
| `completed_at`         | timestamptz     | yes      |                     |                                          |

**Indexes:** `sync_jobs_sync_target_id_idx`, `sync_jobs_status_idx`

---

## Conversation Tables

### `threads`

Chat conversation threads, managed by Mastra memory.

| Column        | Type        | Nullable | Default             | Notes                              |
| ------------- | ----------- | -------- | ------------------- | ---------------------------------- |
| `id`          | uuid        | no       | `gen_random_uuid()` | PK (internal)                      |
| `external_id` | text        | no       |                     | Unique, Mastra-assigned ID         |
| `resource_id` | text        | no       |                     | User/resource scope                |
| `title`       | text        | no       | `''`                | LLM-generated via `setThreadTitle` |
| `metadata`    | jsonb       | yes      |                     | Arbitrary thread metadata          |
| `created_at`  | timestamptz | no       | `now()`             |                                    |
| `updated_at`  | timestamptz | no       | `now()`             | Auto-updates                       |

**Indexes:** `threads_resource_id_created_at_idx`, `threads_metadata_gin_idx` (GIN)

### `messages`

Individual messages within a thread.

| Column        | Type        | Nullable | Default             | Notes                               |
| ------------- | ----------- | -------- | ------------------- | ----------------------------------- |
| `id`          | uuid        | no       | `gen_random_uuid()` | PK                                  |
| `external_id` | text        | no       |                     | Unique, Mastra-assigned ID          |
| `thread_id`   | uuid        | no       |                     | FK -> `threads.id` (cascade delete) |
| `role`        | text        | no       |                     | `user`, `assistant`, `system`       |
| `type`        | text        | no       | `'text'`            |                                     |
| `content`     | jsonb       | no       |                     | Message payload (parts format)      |
| `resource_id` | text        | yes      |                     |                                     |
| `created_at`  | timestamptz | no       | `now()`             |                                     |

**Indexes:** `messages_thread_id_created_at_idx`

### `feedback`

Rep/user feedback on individual assistant messages.

| Column       | Type            | Nullable | Default             | Notes                                |
| ------------ | --------------- | -------- | ------------------- | ------------------------------------ |
| `id`         | uuid            | no       | `gen_random_uuid()` | PK                                   |
| `thread_id`  | uuid            | no       |                     | FK -> `threads.id` (cascade delete)  |
| `message_id` | uuid            | no       |                     | FK -> `messages.id` (cascade delete) |
| `user_id`    | uuid            | no       |                     | FK -> `user.id` (cascade delete)     |
| `rating`     | feedback_rating | no       |                     | `positive` or `negative`             |
| `comment`    | text            | yes      |                     |                                      |
| `created_at` | timestamptz     | no       | `now()`             |                                      |

**Indexes:** `feedback_thread_id_idx`, `feedback_message_id_idx`, `feedback_user_id_idx`, `feedback_rating_idx`, `feedback_thread_message_idx` (composite)

### `resources`

Mastra memory resources (user/session identifiers).

| Column           | Type        | Nullable | Default             | Notes                                   |
| ---------------- | ----------- | -------- | ------------------- | --------------------------------------- |
| `id`             | uuid        | no       | `gen_random_uuid()` | PK                                      |
| `external_id`    | text        | no       |                     | Unique                                  |
| `working_memory` | text        | yes      |                     | Persisted working memory (when enabled) |
| `metadata`       | jsonb       | yes      |                     |                                         |
| `created_at`     | timestamptz | no       | `now()`             |                                         |
| `updated_at`     | timestamptz | no       | `now()`             | Auto-updates                            |

---

## Metadata Tables

### `metadata_field_groups`

Reusable sets of metadata fields that can be composed into templates.

| Column        | Type        | Nullable | Default             | Notes                                                                                                             |
| ------------- | ----------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid        | no       | `gen_random_uuid()` | PK                                                                                                                |
| `name`        | text        | no       |                     | Unique                                                                                                            |
| `description` | text        | yes      |                     |                                                                                                                   |
| `fields`      | jsonb       | no       | `'{}'`              | `Record<string, FieldSpec>` where FieldSpec has `type`, `required?`, `default?`, `allowedValues?`, `description?` |
| `created_at`  | timestamptz | no       | `now()`             |                                                                                                                   |
| `updated_at`  | timestamptz | no       | `now()`             | Auto-updates                                                                                                      |

**Field type values:** `string`, `number`, `boolean`, `string[]`

### `metadata_templates`

Composable templates that define the metadata schema for a sync target's documents.

| Column            | Type        | Nullable | Default             | Notes                                                                |
| ----------------- | ----------- | -------- | ------------------- | -------------------------------------------------------------------- |
| `id`              | uuid        | no       | `gen_random_uuid()` | PK                                                                   |
| `name`            | text        | no       |                     | Unique                                                               |
| `description`     | text        | yes      |                     |                                                                      |
| `field_group_ids` | jsonb       | no       | `'[]'`              | Ordered list of `metadata_field_groups` UUIDs                        |
| `custom_fields`   | jsonb       | no       | `'{}'`              | Extra fields defined directly on the template (same FieldSpec shape) |
| `created_at`      | timestamptz | no       | `now()`             |                                                                      |
| `updated_at`      | timestamptz | no       | `now()`             | Auto-updates                                                         |

---

## Evaluation Tables

### `scores`

Scorer results attached to traces, spans, threads, or entities.

| Column                   | Type        | Nullable | Default             | Notes                         |
| ------------------------ | ----------- | -------- | ------------------- | ----------------------------- |
| `id`                     | uuid        | no       | `gen_random_uuid()` | PK                            |
| `scorer_id`              | text        | yes      |                     |                               |
| `trace_id`               | text        | yes      |                     |                               |
| `span_id`                | text        | yes      |                     |                               |
| `run_id`                 | text        | yes      |                     |                               |
| `scorer`                 | jsonb       | yes      |                     | Scorer definition snapshot    |
| `preprocess_step_result` | jsonb       | yes      |                     |                               |
| `extract_step_result`    | jsonb       | yes      |                     |                               |
| `analyze_step_result`    | jsonb       | yes      |                     |                               |
| `score`                  | real        | yes      |                     | Numeric score (0-1 typically) |
| `reason`                 | text        | yes      |                     | LLM-generated explanation     |
| `metadata`               | jsonb       | yes      |                     |                               |
| `preprocess_prompt`      | text        | yes      |                     |                               |
| `extract_prompt`         | text        | yes      |                     |                               |
| `generate_score_prompt`  | text        | yes      |                     |                               |
| `generate_reason_prompt` | text        | yes      |                     |                               |
| `analyze_prompt`         | text        | yes      |                     |                               |
| `reason_prompt`          | text        | yes      |                     |                               |
| `input`                  | jsonb       | yes      |                     |                               |
| `output`                 | jsonb       | yes      |                     |                               |
| `additional_context`     | jsonb       | yes      |                     |                               |
| `request_context`        | jsonb       | yes      |                     |                               |
| `entity_type`            | text        | yes      |                     |                               |
| `entity`                 | jsonb       | yes      |                     |                               |
| `entity_id`              | text        | yes      |                     |                               |
| `source`                 | text        | yes      |                     |                               |
| `resource_id`            | text        | yes      |                     |                               |
| `thread_id`              | text        | yes      |                     |                               |
| `structured_output`      | text        | yes      |                     |                               |
| `created_at`             | timestamptz | no       | `now()`             |                               |
| `updated_at`             | timestamptz | no       | `now()`             | Auto-updates                  |

**Indexes:** `scores_scorer_id_idx`, `scores_run_id_idx`, `scores_trace_id_span_id_idx`, `scores_entity_id_entity_type_idx`, `scores_thread_id_idx`, `scores_created_at_idx`

### `datasets`

Evaluation datasets containing input/ground-truth pairs.

| Column                   | Type        | Nullable | Default             | Notes                        |
| ------------------------ | ----------- | -------- | ------------------- | ---------------------------- |
| `id`                     | uuid        | no       | `gen_random_uuid()` | PK                           |
| `name`                   | text        | no       |                     |                              |
| `description`            | text        | yes      |                     |                              |
| `metadata`               | jsonb       | yes      |                     |                              |
| `input_schema`           | jsonb       | yes      |                     | JSON Schema for inputs       |
| `ground_truth_schema`    | jsonb       | yes      |                     | JSON Schema for ground truth |
| `request_context_schema` | jsonb       | yes      |                     |                              |
| `version`                | integer     | no       | `0`                 | Current version number       |
| `created_at`             | timestamptz | no       | `now()`             |                              |
| `updated_at`             | timestamptz | no       | `now()`             | Auto-updates                 |

**Indexes:** `datasets_created_at_idx`

### `dataset_items`

Individual items within a dataset, versioned via composite primary key.

| Column            | Type        | Nullable | Default             | Notes                                |
| ----------------- | ----------- | -------- | ------------------- | ------------------------------------ |
| `id`              | uuid        | no       | `gen_random_uuid()` | Composite PK with `dataset_version`  |
| `dataset_id`      | uuid        | no       |                     | FK -> `datasets.id` (cascade delete) |
| `dataset_version` | integer     | no       |                     | Composite PK with `id`               |
| `valid_to`        | integer     | yes      |                     | Version this item was superseded     |
| `is_deleted`      | boolean     | no       | `false`             | Soft delete within version           |
| `input`           | jsonb       | no       |                     |                                      |
| `ground_truth`    | jsonb       | yes      |                     |                                      |
| `request_context` | jsonb       | yes      |                     |                                      |
| `metadata`        | jsonb       | yes      |                     |                                      |
| `created_at`      | timestamptz | no       | `now()`             |                                      |
| `updated_at`      | timestamptz | no       | `now()`             | Auto-updates                         |

**Indexes:** `dataset_items_dataset_id_idx`, `dataset_items_dataset_id_is_deleted_idx`

### `dataset_versions`

Tracks version history for datasets.

| Column       | Type        | Nullable | Default             | Notes                                |
| ------------ | ----------- | -------- | ------------------- | ------------------------------------ |
| `id`         | uuid        | no       | `gen_random_uuid()` | PK                                   |
| `dataset_id` | uuid        | no       |                     | FK -> `datasets.id` (cascade delete) |
| `version`    | integer     | no       |                     |                                      |
| `created_at` | timestamptz | no       | `now()`             |                                      |

### `experiments`

Evaluation experiment runs against datasets.

| Column            | Type              | Nullable | Default             | Notes        |
| ----------------- | ----------------- | -------- | ------------------- | ------------ |
| `id`              | uuid              | no       | `gen_random_uuid()` | PK           |
| `name`            | text              | yes      |                     |              |
| `description`     | text              | yes      |                     |              |
| `metadata`        | jsonb             | yes      |                     |              |
| `dataset_id`      | text              | yes      |                     |              |
| `dataset_version` | integer           | yes      |                     |              |
| `target_type`     | text              | no       |                     | e.g. `agent` |
| `target_id`       | text              | no       |                     |              |
| `status`          | experiment_status | no       |                     |              |
| `total_items`     | integer           | no       | `0`                 |              |
| `succeeded_count` | integer           | no       | `0`                 |              |
| `failed_count`    | integer           | no       | `0`                 |              |
| `skipped_count`   | integer           | no       | `0`                 |              |
| `started_at`      | timestamptz       | yes      |                     |              |
| `completed_at`    | timestamptz       | yes      |                     |              |
| `created_at`      | timestamptz       | no       | `now()`             |              |
| `updated_at`      | timestamptz       | no       | `now()`             | Auto-updates |

**Indexes:** `experiments_created_at_idx`, `experiments_status_idx`

### `experiment_results`

Per-item results from an experiment run.

| Column                 | Type        | Nullable | Default             | Notes                                   |
| ---------------------- | ----------- | -------- | ------------------- | --------------------------------------- |
| `id`                   | uuid        | no       | `gen_random_uuid()` | PK                                      |
| `experiment_id`        | uuid        | no       |                     | FK -> `experiments.id` (cascade delete) |
| `item_id`              | text        | no       |                     |                                         |
| `item_dataset_version` | integer     | yes      |                     |                                         |
| `input`                | jsonb       | no       |                     |                                         |
| `output`               | jsonb       | yes      |                     |                                         |
| `ground_truth`         | jsonb       | yes      |                     |                                         |
| `error`                | jsonb       | yes      |                     |                                         |
| `started_at`           | timestamptz | no       |                     |                                         |
| `completed_at`         | timestamptz | no       |                     |                                         |
| `retry_count`          | integer     | no       | `0`                 |                                         |
| `trace_id`             | text        | yes      |                     | Links to observability                  |
| `created_at`           | timestamptz | no       | `now()`             |                                         |

**Indexes:** `experiment_results_experiment_id_idx`, `experiment_results_experiment_id_created_at_idx`

---

## Observability Tables

### `ai_spans`

OpenTelemetry-compatible spans for AI operations.

| Column               | Type        | Nullable | Default             | Notes |
| -------------------- | ----------- | -------- | ------------------- | ----- |
| `id`                 | uuid        | no       | `gen_random_uuid()` | PK    |
| `trace_id`           | text        | no       |                     |       |
| `span_id`            | text        | no       |                     |       |
| `parent_span_id`     | text        | yes      |                     |       |
| `name`               | text        | no       |                     |       |
| `scope`              | jsonb       | yes      |                     |       |
| `span_type`          | text        | no       |                     |       |
| `is_event`           | boolean     | no       | `false`             |       |
| `started_at`         | timestamptz | no       |                     |       |
| `ended_at`           | timestamptz | yes      |                     |       |
| `attributes`         | jsonb       | yes      |                     |       |
| `metadata`           | jsonb       | yes      |                     |       |
| `links`              | jsonb       | yes      |                     |       |
| `input`              | jsonb       | yes      |                     |       |
| `output`             | jsonb       | yes      |                     |       |
| `error`              | jsonb       | yes      |                     |       |
| `tags`               | jsonb       | yes      |                     |       |
| `entity_type`        | text        | yes      |                     |       |
| `entity_id`          | text        | yes      |                     |       |
| `entity_name`        | text        | yes      |                     |       |
| `parent_entity_type` | text        | yes      |                     |       |
| `parent_entity_id`   | text        | yes      |                     |       |
| `parent_entity_name` | text        | yes      |                     |       |
| `root_entity_type`   | text        | yes      |                     |       |
| `root_entity_id`     | text        | yes      |                     |       |
| `root_entity_name`   | text        | yes      |                     |       |
| `run_id`             | text        | yes      |                     |       |
| `thread_id`          | text        | yes      |                     |       |
| `resource_id`        | text        | yes      |                     |       |
| `request_context`    | jsonb       | yes      |                     |       |
| `source`             | text        | yes      |                     |       |
| `user_id`            | text        | yes      |                     |       |
| `organization_id`    | text        | yes      |                     |       |
| `session_id`         | text        | yes      |                     |       |
| `request_id`         | text        | yes      |                     |       |
| `environment`        | text        | yes      |                     |       |
| `service_name`       | text        | yes      |                     |       |
| `experiment_id`      | text        | yes      |                     |       |
| `created_at`         | timestamptz | no       | `now()`             |       |
| `updated_at`         | timestamptz | yes      | `now()`             |       |

**Indexes:** `ai_spans_trace_id_idx`, `ai_spans_name_started_at_idx`, `ai_spans_entity_type_entity_id_idx`, `ai_spans_run_id_idx`, `ai_spans_parent_span_id_idx`, `ai_spans_thread_id_idx`, `ai_spans_started_at_idx`

### `failed_jobs`

Persistent archive of terminally failed BullMQ jobs for audit and debugging.

| Column           | Type        | Nullable | Default             | Notes                     |
| ---------------- | ----------- | -------- | ------------------- | ------------------------- |
| `id`             | uuid        | no       | `gen_random_uuid()` | PK                        |
| `queue`          | text        | no       |                     | BullMQ queue name         |
| `job_name`       | text        | no       |                     |                           |
| `job_id`         | text        | no       |                     | BullMQ job ID             |
| `data`           | jsonb       | yes      |                     | Job payload               |
| `failed_reason`  | text        | yes      |                     |                           |
| `stacktrace`     | text        | yes      |                     |                           |
| `attempts_made`  | integer     | no       | `0`                 |                           |
| `sync_target_id` | uuid        | yes      |                     | For sync-related jobs     |
| `document_id`    | uuid        | yes      |                     | For document-related jobs |
| `created_at`     | timestamptz | no       | `now()`             |                           |

**Indexes:** `failed_jobs_queue_idx`, `failed_jobs_sync_target_id_idx`, `failed_jobs_created_at_idx`

---

## Mastra Versioned Entity Tables

These tables follow a common pattern: a parent entity table with status tracking and a versions table with full snapshots of each version. All share the `entity_status` enum (`draft`, `active`, `archived`).

### Common Parent Columns

All parent entity tables (`agents`, `skills`, `workspaces`, `prompt_blocks`, `scorer_definitions`, `mcp_servers`, `mcp_clients`) share:

| Column              | Type          | Notes                         |
| ------------------- | ------------- | ----------------------------- |
| `id`                | uuid          | PK                            |
| `status`            | entity_status | Default `'draft'`             |
| `active_version_id` | uuid          | Points to the current version |
| `author_id`         | uuid          |                               |
| `metadata`          | jsonb         | (some tables)                 |
| `created_at`        | timestamptz   |                               |
| `updated_at`        | timestamptz   |                               |

### Common Version Columns

All version tables share:

| Column           | Type        | Notes                               |
| ---------------- | ----------- | ----------------------------------- |
| `id`             | uuid        | PK                                  |
| `<parent>_id`    | uuid        | FK -> parent table (cascade delete) |
| `version_number` | integer     |                                     |
| `name`           | text        |                                     |
| `changed_fields` | jsonb       | `string[]` of changed field names   |
| `change_message` | text        |                                     |
| `created_at`     | timestamptz |                                     |

### `agents` / `agent_versions`

Agent definitions. Versions include `description`, `instructions`, `model`, `tools`, `default_options`, `workflows`, `agents`, `integration_tools`, `input_processors`, `output_processors`, `memory`, `scorers`, `mcp_clients`, `request_context_schema`, `workspace`, `skills`, `skills_format`.

### `skills` / `skill_versions`

Skill definitions. Versions include `description`, `instructions`, `license`, `compatibility`, `source`, `references`, `scripts`, `assets`, `metadata`, `tree`.

### `workspaces` / `workspace_versions`

Workspace definitions. Versions include `description`, `filesystem`, `sandbox`, `mounts`, `search`, `skills`, `tools`, `auto_sync`, `operation_timeout`.

### `prompt_blocks` / `prompt_block_versions`

Prompt block definitions. Versions include `description`, `content`, `rules`, `request_context_schema`.

### `scorer_definitions` / `scorer_definition_versions`

Scorer definitions. Versions include `description`, `type`, `model`, `instructions`, `score_range`, `preset_config`, `default_sampling`.

### `mcp_servers` / `mcp_server_versions`

MCP server registry. Versions include `version`, `description`, `instructions`, `repository`, `release_date`, `is_latest`, `package_canonical`, `tools`, `agents`, `workflows`.

### `mcp_clients` / `mcp_client_versions`

MCP client configurations. Versions include `description`, `servers`.

### Other Mastra Tables

#### `workflow_snapshots`

| Column          | Type        | Nullable | Default             | Notes                   |
| --------------- | ----------- | -------- | ------------------- | ----------------------- |
| `id`            | uuid        | no       | `gen_random_uuid()` | PK                      |
| `workflow_name` | text        | no       |                     |                         |
| `run_id`        | text        | no       |                     |                         |
| `resource_id`   | text        | yes      |                     |                         |
| `snapshot`      | jsonb       | yes      |                     | Workflow state snapshot |
| `created_at`    | timestamptz | no       | `now()`             |                         |
| `updated_at`    | timestamptz | no       | `now()`             |                         |

**Constraints:** Unique on `(workflow_name, run_id)`

#### `skill_blobs`

Content-addressed blob storage for skill assets.

| Column       | Type        | Nullable | Default | Notes             |
| ------------ | ----------- | -------- | ------- | ----------------- |
| `hash`       | text        | no       |         | PK (content hash) |
| `content`    | text        | no       |         |                   |
| `size`       | integer     | no       |         | Bytes             |
| `mime_type`  | text        | yes      |         |                   |
| `created_at` | timestamptz | no       | `now()` |                   |
