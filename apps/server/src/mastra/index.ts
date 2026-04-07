import { Mastra } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { createSupervisor } from '@typhoon/agents';
import { createEmbeddingModel, createTitleModel } from '@typhoon/ai';
import { createAppLogger } from '@typhoon/logger';
import { PgVector, PostgresStore } from '@typhoon/pg';
import { db, sql } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { chatRoutes } from '../routes/chat.js';
import { documentRoutes } from '../routes/documents.js';
import { feedbackRoutes } from '../routes/feedback.js';
import { queueRoutes } from '../routes/queues.js';
import { searchRoutes } from '../routes/search.js';
import { syncTargetRoutes } from '../routes/sync-targets.js';
import { threadRoutes } from '../routes/threads.js';
import { widgetRoutes } from '../routes/widget.js';

const storage = new PostgresStore({
  id: 'typhoon-storage',
  db,
  sql,
});

const pgVector = new PgVector({
  id: 'typhoon-vectors',
  sql,
});

/** Full memory for the knowledge agent — semantic recall, working memory, title generation. */
const memory = new Memory({
  storage,
  vector: pgVector,
  embedder: createEmbeddingModel(),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 5,
      messageRange: 2,
      scope: 'thread',
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# Customer Profile
- **Name**:
- **Company/Org**:
- **Key Issues**: [Recurring topics or unresolved problems]
- **Preferences**: [Communication style, language, etc.]
- **Important Context**: [Anything relevant to future interactions]`,
    },
  },
});

/** Lightweight memory for the supervisor — no semantic recall or working memory. */
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

const supervisor = createSupervisor(memory, supervisorMemory, {
  promptInjection: envFlag('GUARDRAIL_PROMPT_INJECTION', false),
  moderation: envFlag('GUARDRAIL_MODERATION', false),
  piiDetection: envFlag('GUARDRAIL_PII_DETECTION', false),
  systemPromptScrubbing: envFlag('GUARDRAIL_SYSTEM_PROMPT_SCRUBBING'),
});

const logger = createAppLogger('mastra');

export const mastra = new Mastra({
  agents: { supervisor },
  logger,
  storage,
  vectors: { pgVector },
  server: {
    port: 4111,
    apiRoutes: [
      ...authRoutes,
      ...syncTargetRoutes,
      ...documentRoutes,
      ...feedbackRoutes,
      ...queueRoutes,
      ...searchRoutes,
      ...widgetRoutes,
      ...chatRoutes,
      ...threadRoutes,
    ],
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174'],
      credentials: true,
    },
  },
});
