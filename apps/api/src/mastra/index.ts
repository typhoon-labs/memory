import { Mastra } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { createSupervisor } from '@typhoon/agents';
import { createEmbeddingModel } from '@typhoon/ai';
import { PgVector, PostgresStore } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import { createMastraObservability } from '@typhoon/telemetry';
import { db, sql } from '../db';
import { authRoutes } from '../routes/auth';
import { chatRoutes } from '../routes/chat';
import { dashboardRoutes } from '../routes/dashboard';
import { datasetRoutes } from '../routes/datasets';
import { documentRoutes } from '../routes/documents';
import { experimentRoutes } from '../routes/experiments';
import { feedbackRoutes } from '../routes/feedback';
import { metadataFieldGroupRoutes } from '../routes/metadata-field-groups';
import { metadataTemplateRoutes } from '../routes/metadata-templates';
import { queueRoutes } from '../routes/queues';
import { reviewRoutes } from '../routes/reviews';
import { scorerRoutes } from '../routes/scorers';
import { searchRoutes } from '../routes/search';
import { syncTargetRoutes } from '../routes/sync-targets';
import { threadRoutes } from '../routes/threads';
import { traceRoutes } from '../routes/traces';
import { widgetRoutes } from '../routes/widget';

const storage = new PostgresStore({
  id: 'typhoon-storage',
  db,
  sql,
});

const pgVector = new PgVector({
  id: 'typhoon-vectors',
  sql,
});

const supervisorMemory = new Memory({
  storage,
  vector: pgVector,
  embedder: createEmbeddingModel(),
  options: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: { enabled: false },
  },
});

const envFlag = (key: string, defaultValue = true) => {
  const val = process.env[key];
  return val === undefined ? defaultValue : val !== '0' && val !== 'false';
};

// Metadata context with TTL cache — refreshes every 60s so new fields are
// picked up without a server restart.
const METADATA_CONTEXT_TTL_MS = 60_000;
let _metadataCache: { value: string | undefined; expiresAt: number } = { value: undefined, expiresAt: 0 };

async function getMetadataContext(): Promise<string | undefined> {
  if (Date.now() < _metadataCache.expiresAt) return _metadataCache.value;
  try {
    const rows = await sql`
      SELECT kv.key, jsonb_agg(DISTINCT kv.value) FILTER (WHERE jsonb_typeof(kv.value) != 'null') AS values
      FROM documents d, jsonb_each(d.custom_metadata) AS kv(key, value)
      WHERE d.status != 'deleted' AND d.custom_metadata != '{}'::jsonb
      GROUP BY kv.key ORDER BY COUNT(DISTINCT d.id) DESC
    `;
    const value =
      rows.length > 0
        ? (rows as unknown as Array<{ key: string; values: unknown[] }>)
            .map((r) => {
              const vals = (r.values ?? []).map((v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)));
              return `${r.key}: ${vals.join(', ')}`;
            })
            .join(' | ')
        : undefined;
    _metadataCache = { value, expiresAt: Date.now() + METADATA_CONTEXT_TTL_MS };
    return value;
  } catch {
    return _metadataCache.value; // return stale on error
  }
}

const supervisor = createSupervisor(supervisorMemory, {
  guardrails: {
    promptInjection: envFlag('GUARDRAIL_PROMPT_INJECTION', false),
    moderation: envFlag('GUARDRAIL_MODERATION', false),
    piiDetection: envFlag('GUARDRAIL_PII_DETECTION', false),
    systemPromptScrubbing: envFlag('GUARDRAIL_SYSTEM_PROMPT_SCRUBBING'),
  },
  getMetadataContext,
});

const logger = createAppLogger('mastra');

export const mastra = new Mastra({
  agents: { supervisor },
  logger,
  observability: createMastraObservability('typhoon-api'),
  storage,
  vectors: { pgVector },
  server: {
    port: 4111,
    apiRoutes: [
      ...authRoutes,
      ...syncTargetRoutes,
      ...documentRoutes,
      ...metadataFieldGroupRoutes,
      ...metadataTemplateRoutes,
      ...feedbackRoutes,
      ...reviewRoutes,
      ...dashboardRoutes,
      ...datasetRoutes,
      ...experimentRoutes,
      ...scorerRoutes,
      ...queueRoutes,
      ...searchRoutes,
      ...widgetRoutes,
      ...chatRoutes,
      ...threadRoutes,
      ...traceRoutes,
    ],
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174'],
      credentials: true,
    },
  },
});
