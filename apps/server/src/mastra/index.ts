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
    generateTitle: {
      model: createTitleModel(),
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

const supervisor = createSupervisor(memory, supervisorMemory);

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
