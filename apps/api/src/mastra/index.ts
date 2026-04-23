import { Mastra } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { createSupervisor } from '@typhoon/agents';
import { createEmbeddingModel, createTitleModel } from '@typhoon/ai';
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
    generateTitle: {
      model: createTitleModel(),
    },
  },
});

const envFlag = (key: string, defaultValue = true) => {
  const val = process.env[key];
  return val === undefined ? defaultValue : val !== '0' && val !== 'false';
};

const supervisor = createSupervisor(supervisorMemory, {
  promptInjection: envFlag('GUARDRAIL_PROMPT_INJECTION', false),
  moderation: envFlag('GUARDRAIL_MODERATION', false),
  piiDetection: envFlag('GUARDRAIL_PII_DETECTION', false),
  systemPromptScrubbing: envFlag('GUARDRAIL_SYSTEM_PROMPT_SCRUBBING'),
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
