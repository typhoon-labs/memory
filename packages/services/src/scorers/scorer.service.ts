import type { DrizzleScorerDefinitionsStorage } from '@typhoon/db/drivers/pg';
import type { ScorerRepo } from '@typhoon/db/repos';
import type { ScorerDefinitionVersion } from '@typhoon/evals';
import { constructScorer } from '@typhoon/evals';

import type { Result } from '../types';

export interface ScorerServiceDeps {
  scorerStorage: DrizzleScorerDefinitionsStorage;
  scorerRepo: ScorerRepo;
}

/** Read a field supporting both camelCase (Drizzle ORM) and snake_case (raw SQL) keys. */
function f(r: Record<string, unknown>, camel: string, snake: string) {
  return r[camel] ?? r[snake];
}

/** Map a raw scorer definition row + joined version to camelCase API shape. */
function mapDefinitionRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    status: r.status,
    activeVersionId: f(r, 'activeVersionId', 'active_version_id'),
    authorId: f(r, 'authorId', 'author_id'),
    metadata: r.metadata,
    createdAt: f(r, 'createdAt', 'created_at'),
    updatedAt: f(r, 'updatedAt', 'updated_at'),
    name: r.name ?? null,
    description: r.description ?? null,
    type: r.type ?? null,
    model: r.model ?? null,
    instructions: r.instructions ?? null,
    scoreRange: f(r, 'scoreRange', 'score_range') ?? null,
    presetConfig: f(r, 'presetConfig', 'preset_config') ?? null,
    defaultSampling: f(r, 'defaultSampling', 'default_sampling') ?? null,
    versionNumber: f(r, 'versionNumber', 'version_number') ?? null,
    changeMessage: f(r, 'changeMessage', 'change_message') ?? null,
  };
}

/** Map a version row to camelCase API shape. */
function mapVersionRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    scorerDefinitionId: f(r, 'scorerDefinitionId', 'scorer_definition_id'),
    versionNumber: f(r, 'versionNumber', 'version_number'),
    name: r.name,
    description: r.description,
    type: r.type,
    model: r.model,
    instructions: r.instructions,
    scoreRange: f(r, 'scoreRange', 'score_range'),
    presetConfig: f(r, 'presetConfig', 'preset_config'),
    defaultSampling: f(r, 'defaultSampling', 'default_sampling'),
    changedFields: f(r, 'changedFields', 'changed_fields'),
    changeMessage: f(r, 'changeMessage', 'change_message'),
    createdAt: f(r, 'createdAt', 'created_at'),
  };
}

/** Parse LLM_SCORING_MODEL_OPTIONS env into a list, falling back to the default scoring model. */
function getScorerModels(): string[] {
  const raw = process.env.LLM_SCORING_MODEL_OPTIONS;
  if (raw) {
    const models = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length > 0) return models;
  }
  return [process.env.LLM_SCORING_MODEL ?? 'claude-haiku-4-5-20251001'];
}

export class ScorerService {
  constructor(private deps: ScorerServiceDeps) {}

  /** Get available scorer models and default model. */
  getModels(): Result<{ models: string[]; defaultModel: string }> {
    const models = getScorerModels();
    const defaultModel = process.env.LLM_SCORING_MODEL ?? models[0];
    return { data: { models, defaultModel } };
  }

  /** List scorer definitions with active version info. */
  async list(opts: {
    page?: number;
    perPage?: number;
    status?: string;
  }): Promise<Result<{ scorers: unknown[]; total: number; page: number; perPage: number; hasMore: boolean }>> {
    const page = Math.max(0, opts.page ?? 0);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 100));
    const status = opts.status;

    const rows = await this.deps.scorerRepo.listWithLatestVersion(page, perPage, status);
    const total = await this.deps.scorerRepo.countByStatus(status);

    return {
      data: {
        scorers: rows.map(mapDefinitionRow),
        total,
        page,
        perPage,
        hasMore: (page + 1) * perPage < total,
      },
    };
  }

  /** Create a new scorer definition + initial version. */
  async create(input: {
    name: string;
    type: string;
    description?: string | null;
    model?: unknown;
    instructions?: string | null;
    scoreRange?: unknown;
    presetConfig?: unknown;
    defaultSampling?: unknown;
  }): Promise<Result<Record<string, unknown>>> {
    if (!input.name || typeof input.name !== 'string') {
      return { error: 'validation-failed', details: 'name is required' };
    }
    if (!input.type || typeof input.type !== 'string') {
      return { error: 'validation-failed', details: 'type is required' };
    }

    const definition = (await this.deps.scorerStorage.create({
      scorerDefinition: { status: 'draft' },
    } as never)) as Record<string, unknown>;

    const defId = definition.id as string;

    const version = (await this.deps.scorerStorage.createVersion({
      scorerDefinitionId: defId,
      versionNumber: 1,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      model: input.model ?? null,
      instructions: input.instructions ?? null,
      scoreRange: input.scoreRange ?? null,
      presetConfig: input.presetConfig ?? null,
      defaultSampling: input.defaultSampling ?? null,
      changeMessage: 'Initial version',
      createdAt: new Date(),
    } as never)) as Record<string, unknown>;

    return {
      data: {
        ...mapDefinitionRow({ ...definition, ...version, id: defId, active_version_id: null }),
        versionId: version.id,
      },
    };
  }

  /** Get a scorer definition with active version. */
  async getById(id: string): Promise<Result<Record<string, unknown>>> {
    const row = await this.deps.scorerRepo.findByIdWithVersion(id);

    if (!row) return { error: 'not-found' };

    // If no active version, try to get the latest version
    if (!row.name) {
      const latest = (await this.deps.scorerStorage.getLatestVersion(id)) as Record<string, unknown> | null;
      if (latest) {
        return {
          data: {
            ...mapDefinitionRow({ ...row, ...latest, id: row.id }),
            versionId: latest.id,
          },
        };
      }
    }

    return { data: mapDefinitionRow(row) };
  }

  /** Update a scorer definition (status, metadata, etc). */
  async update(id: string, body: Record<string, unknown>): Promise<Result<Record<string, unknown>>> {
    const existing = (await this.deps.scorerStorage.getById(id)) as Record<string, unknown> | null;
    if (!existing) return { error: 'not-found' };

    const updated = (await this.deps.scorerStorage.update({ id, ...body } as never)) as Record<string, unknown>;
    return { data: mapDefinitionRow(updated) };
  }

  /** Delete a scorer definition. */
  async delete(id: string): Promise<Result<{ ok: true }>> {
    const existing = (await this.deps.scorerStorage.getById(id)) as Record<string, unknown> | null;
    if (!existing) return { error: 'not-found' };

    await this.deps.scorerStorage.delete(id);
    return { data: { ok: true } };
  }

  /** List version history for a scorer. */
  async listVersions(
    scorerDefinitionId: string,
    opts: { page?: number; perPage?: number },
  ): Promise<Result<{ versions: unknown[]; total: number; page: number; perPage: number; hasMore: boolean }>> {
    const page = Math.max(0, opts.page ?? 0);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 100));

    const result = (await this.deps.scorerStorage.listVersions({
      scorerDefinitionId,
      page,
      perPage,
      orderBy: { field: 'version_number', direction: 'desc' },
    } as never)) as { rows: Record<string, unknown>[]; total: number; hasMore: boolean };

    return {
      data: {
        versions: result.rows.map(mapVersionRow),
        total: result.total,
        page,
        perPage,
        hasMore: result.hasMore,
      },
    };
  }

  /** Create a new version of an existing scorer. */
  async createVersion(
    scorerDefinitionId: string,
    input: Record<string, unknown>,
  ): Promise<Result<Record<string, unknown>>> {
    const existing = (await this.deps.scorerStorage.getById(scorerDefinitionId)) as Record<string, unknown> | null;
    if (!existing) return { error: 'not-found' };

    // Determine next version number
    const versionCount = await this.deps.scorerStorage.countVersions(scorerDefinitionId);
    const nextVersion = versionCount + 1;

    // Compute changed fields by diffing against previous version
    const prev = (await this.deps.scorerStorage.getLatestVersion(scorerDefinitionId)) as Record<string, unknown> | null;
    const diffKeys = ['name', 'description', 'type', 'model', 'instructions', 'scoreRange'] as const;
    const changedFields = prev
      ? diffKeys.filter((k) => JSON.stringify(input[k] ?? null) !== JSON.stringify(prev[k] ?? null))
      : null;

    const version = (await this.deps.scorerStorage.createVersion({
      scorerDefinitionId,
      versionNumber: nextVersion,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      model: input.model ?? null,
      instructions: input.instructions ?? null,
      scoreRange: input.scoreRange ?? null,
      presetConfig: input.presetConfig ?? null,
      defaultSampling: input.defaultSampling ?? null,
      changedFields: changedFields && changedFields.length > 0 ? changedFields : null,
      changeMessage: input.changeMessage ?? null,
      createdAt: new Date(),
    } as never)) as Record<string, unknown>;

    return { data: mapVersionRow(version) };
  }

  /** Publish a version (set as active). */
  async publishVersion(id: string, versionId?: string): Promise<Result<Record<string, unknown>>> {
    const existing = (await this.deps.scorerStorage.getById(id)) as Record<string, unknown> | null;
    if (!existing) return { error: 'not-found' };

    let resolvedVersionId = versionId;
    if (!resolvedVersionId) {
      const latest = (await this.deps.scorerStorage.getLatestVersion(id)) as Record<string, unknown> | null;
      if (!latest) return { error: 'validation-failed', details: 'No versions available' };
      resolvedVersionId = latest.id as string;
    } else {
      const version = (await this.deps.scorerStorage.getVersion(resolvedVersionId)) as Record<string, unknown> | null;
      if (!version) return { error: 'version-not-found' };
    }

    const updated = (await this.deps.scorerStorage.update({
      id,
      status: 'active',
      activeVersionId: resolvedVersionId,
    } as never)) as Record<string, unknown>;

    return { data: mapDefinitionRow(updated) };
  }

  /** Preview — test a scorer against sample data. */
  async previewScore(
    id: string,
    input: {
      response: string;
      context: string[];
      question: string;
      versionId?: string;
    },
    createModel: () => unknown,
  ): Promise<Result<{ score: number; reason: string | null; durationMs: number }>> {
    if (!input.response || !input.question) {
      return { error: 'validation-failed', details: 'response and question are required' };
    }

    // Load version data
    let version: Record<string, unknown> | null;
    if (input.versionId) {
      version = (await this.deps.scorerStorage.getVersion(input.versionId)) as Record<string, unknown> | null;
    } else {
      version = (await this.deps.scorerStorage.getLatestVersion(id)) as Record<string, unknown> | null;
    }
    if (!version) return { error: 'version-not-found' };

    // Construct the scorer
    const definition: ScorerDefinitionVersion = {
      id: id,
      name: version.name as string,
      type: version.type as string,
      description: (version.description as string) ?? null,
      model: (version.model as Record<string, unknown>) ?? null,
      instructions: (version.instructions as string) ?? null,
      scoreRange: (version.score_range as { min: number; max: number; step?: number }) ?? null,
      presetConfig: (version.preset_config as Record<string, unknown>) ?? null,
      defaultSampling: (version.default_sampling as Record<string, unknown>) ?? null,
    };

    const entry = constructScorer(definition, createModel as never, input.context ?? []);
    if (!entry) {
      const needsContext = ['contextRelevance', 'contextPrecision'].includes(definition.type);
      return {
        error: 'validation-failed',
        details: needsContext
          ? `This scorer type (${definition.type}) requires context chunks to evaluate.`
          : 'Cannot construct scorer.',
      };
    }

    const startMs = Date.now();
    try {
      const scorerInput = {
        inputMessages: [{ role: 'user' as const, content: { content: input.question } }],
        rememberedMessages: [],
        systemMessages: [],
        taggedSystemMessages: {},
      };
      const scorerOutput = [{ role: 'assistant' as const, content: { content: input.response } }];

      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Scorer run() types vary between prebuilt scorers
      const result = await (entry.scorer as any).run({
        input: scorerInput,
        output: scorerOutput,
      });

      return {
        data: {
          score: result.score,
          reason: result.reason ?? null,
          durationMs: Date.now() - startMs,
        },
      };
    } catch (err) {
      return {
        error: 'scorer-execution-failed',
        details: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
