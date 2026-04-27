import { registerApiRoute } from '@mastra/core/server';
import { constructScorer, type ScorerDefinitionVersion } from '@typhoon/agents';
import { DrizzleScorerDefinitionsStorage } from '@typhoon/db/drivers/pg';
import { db, sql } from '../db';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';

const storage = new DrizzleScorerDefinitionsStorage(db);

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

export const scorerRoutes = [
  // Available models for scorer selection
  registerApiRoute('/v1/admin/scorers/models', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const models = getScorerModels();
      const defaultModel = process.env.LLM_SCORING_MODEL ?? models[0];
      return c.json({ models, defaultModel });
    },
  }),

  // List scorer definitions with active version info
  registerApiRoute('/v1/admin/scorers', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const page = Math.max(0, Number(c.req.query('page') ?? '0'));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '100')));
      const status = c.req.query('status');

      const statusFilter =
        status && ['draft', 'active', 'archived'].includes(status) ? `AND d.status = '${status}'` : '';

      const rows = (await sql.unsafe(
        `SELECT d.*, v.name, v.description, v.type, v.model, v.instructions,
                v.score_range, v.preset_config, v.default_sampling, v.version_number,
                v.change_message
         FROM scorer_definitions d
         LEFT JOIN scorer_definition_versions v
           ON v.id = COALESCE(
             d.active_version_id,
             (SELECT id FROM scorer_definition_versions
              WHERE scorer_definition_id = d.id
              ORDER BY version_number DESC LIMIT 1)
           )
         WHERE 1=1 ${statusFilter}
         ORDER BY d.updated_at DESC
         LIMIT $1 OFFSET $2`,
        [perPage, page * perPage],
      )) as Array<Record<string, unknown>>;

      const [countRow] = (await sql.unsafe(
        `SELECT COUNT(*)::int AS count FROM scorer_definitions d WHERE 1=1 ${statusFilter}`,
      )) as Array<{ count: number }>;
      const total = countRow?.count ?? 0;

      return c.json({
        scorers: rows.map(mapDefinitionRow),
        total,
        page,
        perPage,
        hasMore: (page + 1) * perPage < total,
      });
    },
  }),

  // Create new scorer definition + initial version
  registerApiRoute('/v1/admin/scorers', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const { name, type, description, model, instructions, scoreRange, presetConfig, defaultSampling } = body;

      if (!name || typeof name !== 'string') {
        return c.json({ error: 'name is required' }, 400);
      }
      if (!type || typeof type !== 'string') {
        return c.json({ error: 'type is required' }, 400);
      }

      // Create the definition
      const definition = (await storage.create({
        scorerDefinition: { status: 'draft' },
      } as never)) as Record<string, unknown>;

      const defId = definition.id as string;

      // Create initial version (v1)
      const version = (await storage.createVersion({
        scorerDefinitionId: defId,
        versionNumber: 1,
        name,
        description: description ?? null,
        type,
        model: model ?? null,
        instructions: instructions ?? null,
        scoreRange: scoreRange ?? null,
        presetConfig: presetConfig ?? null,
        defaultSampling: defaultSampling ?? null,
        changeMessage: 'Initial version',
        createdAt: new Date(),
      } as never)) as Record<string, unknown>;

      return c.json(
        {
          ...mapDefinitionRow({ ...definition, ...version, id: defId, active_version_id: null }),
          versionId: version.id,
        },
        201,
      );
    },
  }),

  // Get scorer definition with active version
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');

      const [row] = (await sql.unsafe(
        `SELECT d.*, v.name, v.description, v.type, v.model, v.instructions,
                v.score_range, v.preset_config, v.default_sampling, v.version_number,
                v.change_message
         FROM scorer_definitions d
         LEFT JOIN scorer_definition_versions v ON v.id = d.active_version_id
         WHERE d.id = $1`,
        [id],
      )) as Array<Record<string, unknown>>;

      if (!row) return c.json({ error: 'Scorer not found' }, 404);

      // If no active version, try to get the latest version
      if (!row.name) {
        const latest = (await storage.getLatestVersion(id)) as Record<string, unknown> | null;
        if (latest) {
          return c.json({
            ...mapDefinitionRow({ ...row, ...latest, id: row.id }),
            versionId: latest.id,
          });
        }
      }

      return c.json(mapDefinitionRow(row));
    },
  }),

  // Update scorer definition status
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();

      const existing = (await storage.getById(id)) as Record<string, unknown> | null;
      if (!existing) return c.json({ error: 'Scorer not found' }, 404);

      const updated = (await storage.update({ id, ...body } as never)) as Record<string, unknown>;
      return c.json(mapDefinitionRow(updated));
    },
  }),

  // Delete scorer definition
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const existing = (await storage.getById(id)) as Record<string, unknown> | null;
      if (!existing) return c.json({ error: 'Scorer not found' }, 404);

      await storage.delete(id);
      return c.json({ ok: true });
    },
  }),

  // List version history for a scorer
  registerApiRoute('/v1/admin/scorers/:id/versions', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const scorerDefinitionId = c.req.param('id');
      const page = Math.max(0, Number(c.req.query('page') ?? '0'));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '100')));

      const result = (await storage.listVersions({
        scorerDefinitionId,
        page,
        perPage,
        orderBy: { field: 'version_number', direction: 'desc' },
      } as never)) as { rows: Record<string, unknown>[]; total: number; hasMore: boolean };

      return c.json({
        versions: result.rows.map(mapVersionRow),
        total: result.total,
        page,
        perPage,
        hasMore: result.hasMore,
      });
    },
  }),

  // Create a new version
  registerApiRoute('/v1/admin/scorers/:id/versions', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const scorerDefinitionId = c.req.param('id');
      const body = await c.req.json();

      const existing = (await storage.getById(scorerDefinitionId)) as Record<string, unknown> | null;
      if (!existing) return c.json({ error: 'Scorer not found' }, 404);

      // Determine next version number
      const versionCount = await storage.countVersions(scorerDefinitionId);
      const nextVersion = versionCount + 1;

      // Compute changed fields by diffing against previous version
      const prev = (await storage.getLatestVersion(scorerDefinitionId)) as Record<string, unknown> | null;
      const diffKeys = ['name', 'description', 'type', 'model', 'instructions', 'scoreRange'] as const;
      const changedFields = prev
        ? diffKeys.filter((k) => JSON.stringify(body[k] ?? null) !== JSON.stringify(prev[k] ?? null))
        : null;

      const version = (await storage.createVersion({
        scorerDefinitionId,
        versionNumber: nextVersion,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        model: body.model ?? null,
        instructions: body.instructions ?? null,
        scoreRange: body.scoreRange ?? null,
        presetConfig: body.presetConfig ?? null,
        defaultSampling: body.defaultSampling ?? null,
        changedFields: changedFields && changedFields.length > 0 ? changedFields : null,
        changeMessage: body.changeMessage ?? null,
        createdAt: new Date(),
      } as never)) as Record<string, unknown>;

      return c.json(mapVersionRow(version), 201);
    },
  }),

  // Publish a version (set as active)
  registerApiRoute('/v1/admin/scorers/:id/publish', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));

      const existing = (await storage.getById(id)) as Record<string, unknown> | null;
      if (!existing) return c.json({ error: 'Scorer not found' }, 404);

      // Use specified versionId or latest
      let versionId = body.versionId as string | undefined;
      if (!versionId) {
        const latest = (await storage.getLatestVersion(id)) as Record<string, unknown> | null;
        if (!latest) return c.json({ error: 'No versions available' }, 400);
        versionId = latest.id as string;
      } else {
        // Validate version exists
        const version = (await storage.getVersion(versionId)) as Record<string, unknown> | null;
        if (!version) return c.json({ error: 'Version not found' }, 404);
      }

      const updated = (await storage.update({
        id,
        status: 'active',
        activeVersionId: versionId,
      } as never)) as Record<string, unknown>;

      return c.json(mapDefinitionRow(updated));
    },
  }),

  // Preview — test a scorer against sample data
  registerApiRoute('/v1/admin/scorers/:id/preview', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();

      const { response, context, question, versionId } = body as {
        response: string;
        context: string[];
        question: string;
        versionId?: string;
      };

      if (!response || !question) {
        return c.json({ error: 'response and question are required' }, 400);
      }

      // Load version data
      let version: Record<string, unknown> | null;
      if (versionId) {
        version = (await storage.getVersion(versionId)) as Record<string, unknown> | null;
      } else {
        version = (await storage.getLatestVersion(id)) as Record<string, unknown> | null;
      }
      if (!version) return c.json({ error: 'No version found' }, 404);

      // Construct the scorer
      const { createScoringModel } = await import('@typhoon/ai');
      const model = createScoringModel();

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

      const entry = constructScorer(definition, model, context ?? []);
      if (!entry) {
        const needsContext = ['faithfulness', 'hallucination', 'contextRelevance', 'contextPrecision'].includes(
          definition.type,
        );
        return c.json(
          {
            error: needsContext
              ? `This scorer type (${definition.type}) requires context chunks to evaluate.`
              : 'Cannot construct scorer.',
          },
          400,
        );
      }

      const startMs = Date.now();
      try {
        const scorerInput = {
          inputMessages: [{ role: 'user' as const, content: { content: question } }],
          rememberedMessages: [],
          systemMessages: [],
          taggedSystemMessages: {},
        };
        const scorerOutput = [{ role: 'assistant' as const, content: { content: response } }];

        // biome-ignore lint/suspicious/noExplicitAny: Scorer run() types vary between prebuilt scorers
        const result = await (entry.scorer as any).run({
          input: scorerInput,
          output: scorerOutput,
        });

        return c.json({
          score: result.score,
          reason: result.reason ?? null,
          durationMs: Date.now() - startMs,
        });
      } catch (err) {
        return c.json(
          {
            error: 'Scorer execution failed',
            message: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startMs,
          },
          500,
        );
      }
    },
  }),
];
