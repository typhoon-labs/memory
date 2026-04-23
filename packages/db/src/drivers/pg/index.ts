import { MastraCompositeStore } from '@mastra/core/storage';
import { DrizzleAgentsStorage } from './agents';
import { DrizzleBlobsStorage } from './blobs';
import type { PostgresStoreConfig } from './config';
import { resolveStoreConnection } from './connection';
import { DrizzleDatasetsStorage } from './datasets';
import { DrizzleExperimentsStorage } from './experiments';
import { DrizzleMCPClientsStorage } from './mcp-clients';
import { DrizzleMCPServersStorage } from './mcp-servers';
import { DrizzleMemoryStorage } from './memory';
import { DrizzleObservabilityStorage } from './observability';
import { DrizzlePromptBlocksStorage } from './prompt-blocks';
import { DrizzleScorerDefinitionsStorage } from './scorer-definitions';
import { DrizzleScoresStorage } from './scores';
import { DrizzleSkillsStorage } from './skills';
import { DrizzleWorkflowsStorage } from './workflows';
import { DrizzleWorkspacesStorage } from './workspaces';

export class PgStore extends MastraCompositeStore {
  private closeSql: (() => Promise<void>) | null = null;

  constructor(config: PostgresStoreConfig) {
    const resolved = resolveStoreConnection(config);

    super({
      id: config.id,
      domains: {
        memory: new DrizzleMemoryStorage({ db: resolved.db }),
        workflows: new DrizzleWorkflowsStorage(resolved.db),
        scores: new DrizzleScoresStorage(resolved.db),
        datasets: new DrizzleDatasetsStorage(resolved.db),
        experiments: new DrizzleExperimentsStorage(resolved.db),
        observability: new DrizzleObservabilityStorage(resolved.db),
        agents: new DrizzleAgentsStorage(resolved.db),
        promptBlocks: new DrizzlePromptBlocksStorage(resolved.db),
        scorerDefinitions: new DrizzleScorerDefinitionsStorage(resolved.db),
        skills: new DrizzleSkillsStorage(resolved.db),
        workspaces: new DrizzleWorkspacesStorage(resolved.db),
        mcpClients: new DrizzleMCPClientsStorage(resolved.db),
        mcpServers: new DrizzleMCPServersStorage(resolved.db),
        blobs: new DrizzleBlobsStorage(resolved.db),
      },
    });

    if (resolved.owned) {
      this.closeSql = async () => {
        await resolved.sql.end();
      };
    }
  }

  async close(): Promise<void> {
    if (this.closeSql) {
      await this.closeSql();
    }
  }
}

// Re-export types and classes consumers need
export type { PgVectorConfig, PostgresStoreConfig } from './config';
export { DrizzleDatasetsStorage } from './datasets';
export { DrizzleExperimentsStorage } from './experiments';
export type { PGVectorFilter } from './filter';
export { sanitizeKey } from './filter';
export { DrizzleObservabilityStorage } from './observability';
export type { RefineOptions, RerankFn } from './retrieval';
export { refineResults } from './retrieval';
export { DrizzleScorerDefinitionsStorage } from './scorer-definitions';
export { PgVector } from './vector';
/** @deprecated Use PgStore instead */
export { PgStore as PostgresStore };
