import { MastraCompositeStore } from '@mastra/core/storage';
import type { PostgresStoreConfig } from '../config.js';
import { resolveStoreConnection } from '../connection.js';
import { DrizzleAgentsStorage } from './agents.js';
import { DrizzleBlobsStorage } from './blobs.js';
import { DrizzleDatasetsStorage } from './datasets.js';
import { DrizzleExperimentsStorage } from './experiments.js';
import { DrizzleMCPClientsStorage } from './mcp-clients.js';
import { DrizzleMCPServersStorage } from './mcp-servers.js';
import { DrizzleMemoryStorage } from './memory.js';
import { DrizzleObservabilityStorage } from './observability.js';
import { DrizzlePromptBlocksStorage } from './prompt-blocks.js';
import { DrizzleScorerDefinitionsStorage } from './scorer-definitions.js';
import { DrizzleScoresStorage } from './scores.js';
import { DrizzleSkillsStorage } from './skills.js';
import { DrizzleWorkflowsStorage } from './workflows.js';
import { DrizzleWorkspacesStorage } from './workspaces.js';

export class PostgresStore extends MastraCompositeStore {
  private owned: boolean;
  private closeSql: (() => Promise<void>) | null = null;

  constructor(config: PostgresStoreConfig) {
    const resolved = resolveStoreConnection(config);

    super({
      id: config.id,
      domains: {
        memory: new DrizzleMemoryStorage({ db: resolved.db }),
        workflows: new DrizzleWorkflowsStorage(resolved.db),
        scores: new DrizzleScoresStorage(resolved.sql),
        datasets: new DrizzleDatasetsStorage(resolved.sql),
        experiments: new DrizzleExperimentsStorage(resolved.sql),
        observability: new DrizzleObservabilityStorage(resolved.sql),
        agents: new DrizzleAgentsStorage(resolved.sql),
        promptBlocks: new DrizzlePromptBlocksStorage(resolved.sql),
        scorerDefinitions: new DrizzleScorerDefinitionsStorage(resolved.sql),
        skills: new DrizzleSkillsStorage(resolved.sql),
        workspaces: new DrizzleWorkspacesStorage(resolved.sql),
        mcpClients: new DrizzleMCPClientsStorage(resolved.sql),
        mcpServers: new DrizzleMCPServersStorage(resolved.sql),
        blobs: new DrizzleBlobsStorage(resolved.sql),
      },
    });

    this.owned = resolved.owned;
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
