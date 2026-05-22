import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import type { ScorerServiceDeps } from './scorer.service';
import { ScorerService } from './scorer.service';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<ScorerServiceDeps> = {}): ScorerServiceDeps {
  return {
    scorerStorage: {
      create: vi.fn().mockResolvedValue({ id: 'def-1', status: 'draft' }),
      createVersion: vi.fn().mockResolvedValue({ id: 'ver-1', versionNumber: 1 }),
      getById: vi.fn().mockResolvedValue(null),
      getVersion: vi.fn().mockResolvedValue(null),
      getLatestVersion: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
      listVersions: vi.fn().mockResolvedValue({ rows: [], total: 0, hasMore: false }),
      countVersions: vi.fn().mockResolvedValue(0),
    } as unknown as ScorerServiceDeps['scorerStorage'],
    scorerRepo: {
      listWithLatestVersion: vi.fn().mockResolvedValue([]),
      countByStatus: vi.fn().mockResolvedValue(0),
      findByIdWithVersion: vi.fn().mockResolvedValue(null),
    } as unknown as ScorerServiceDeps['scorerRepo'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ScorerService', () => {
  let deps: ScorerServiceDeps;
  let service: ScorerService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new ScorerService(deps);
  });

  describe('getModels', () => {
    it('returns default model when no env vars set', () => {
      delete process.env.LLM_SCORING_MODEL_OPTIONS;
      delete process.env.LLM_SCORING_MODEL;
      const result = service.getModels();
      const data = assertOk(result);
      expect(data.models).toEqual(['claude-haiku-4-5-20251001']);
      expect(data.defaultModel).toBe('claude-haiku-4-5-20251001');
    });

    it('reads LLM_SCORING_MODEL_OPTIONS when set', () => {
      process.env.LLM_SCORING_MODEL_OPTIONS = 'model-a, model-b, model-c';
      delete process.env.LLM_SCORING_MODEL;
      const result = service.getModels();
      const data = assertOk(result);
      expect(data.models).toEqual(['model-a', 'model-b', 'model-c']);
      expect(data.defaultModel).toBe('model-a');
      delete process.env.LLM_SCORING_MODEL_OPTIONS;
    });

    it('uses LLM_SCORING_MODEL as default when set', () => {
      process.env.LLM_SCORING_MODEL = 'custom-model';
      delete process.env.LLM_SCORING_MODEL_OPTIONS;
      const result = service.getModels();
      const data = assertOk(result);
      expect(data.models).toEqual(['custom-model']);
      expect(data.defaultModel).toBe('custom-model');
      delete process.env.LLM_SCORING_MODEL;
    });
  });

  describe('list', () => {
    it('returns paginated scorers', async () => {
      const row = {
        id: 'def-1',
        status: 'active',
        active_version_id: 'ver-1',
        author_id: 'user-1',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
        name: 'Test Scorer',
        description: 'desc',
        type: 'llm',
        model: null,
        instructions: 'test',
        score_range: null,
        preset_config: null,
        default_sampling: null,
        version_number: 1,
        change_message: 'Initial',
      };
      vi.mocked(deps.scorerRepo.listWithLatestVersion).mockResolvedValueOnce([row]);
      vi.mocked(deps.scorerRepo.countByStatus).mockResolvedValueOnce(1);

      const result = await service.list({ page: 0, perPage: 10 });
      const data = assertOk(result);
      expect(data.scorers).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.hasMore).toBe(false);
      expect(data.page).toBe(0);
      expect(data.perPage).toBe(10);
    });

    it('computes hasMore correctly', async () => {
      vi.mocked(deps.scorerRepo.listWithLatestVersion).mockResolvedValueOnce([{ id: 'def-1', status: 'active' }]);
      vi.mocked(deps.scorerRepo.countByStatus).mockResolvedValueOnce(50);

      const result = await service.list({ page: 0, perPage: 10 });
      const data = assertOk(result);
      expect(data.hasMore).toBe(true);
    });

    it('clamps page and perPage values', async () => {
      vi.mocked(deps.scorerRepo.listWithLatestVersion).mockResolvedValueOnce([]);
      vi.mocked(deps.scorerRepo.countByStatus).mockResolvedValueOnce(0);

      const result = await service.list({ page: -5, perPage: 999 });
      const data = assertOk(result);
      expect(data.page).toBe(0);
      expect(data.perPage).toBe(100);
    });
  });

  describe('create', () => {
    it('creates a scorer definition with initial version', async () => {
      const result = await service.create({
        name: 'My Scorer',
        type: 'llm',
        description: 'A test scorer',
      });

      expect('data' in result).toBe(true);
      expect(deps.scorerStorage.create).toHaveBeenCalledWith({ scorerDefinition: { status: 'draft' } });
      expect(deps.scorerStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          scorerDefinitionId: 'def-1',
          versionNumber: 1,
          name: 'My Scorer',
          type: 'llm',
          description: 'A test scorer',
          changeMessage: 'Initial version',
        }),
      );
    });

    it('returns validation error when name is missing', async () => {
      const result = await service.create({ name: '', type: 'llm' });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns validation error when type is missing', async () => {
      const result = await service.create({ name: 'Test', type: '' });
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });
  });

  describe('getById', () => {
    it('returns mapped scorer when found', async () => {
      const row = {
        id: 'def-1',
        status: 'active',
        active_version_id: 'ver-1',
        author_id: 'user-1',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
        name: 'Test',
        description: null,
        type: 'llm',
        model: null,
        instructions: null,
        score_range: null,
        preset_config: null,
        default_sampling: null,
        version_number: 1,
        change_message: null,
      };
      vi.mocked(deps.scorerRepo.findByIdWithVersion).mockResolvedValueOnce(row);

      const result = await service.getById('def-1');
      const data = assertOk(result);
      expect(data).toMatchObject({ id: 'def-1', name: 'Test', type: 'llm' });
    });

    it('returns not-found when scorer does not exist', async () => {
      vi.mocked(deps.scorerRepo.findByIdWithVersion).mockResolvedValueOnce(null);
      const result = await service.getById('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('falls back to latest version when no active version name', async () => {
      const row = {
        id: 'def-1',
        status: 'draft',
        active_version_id: null,
        author_id: 'user-1',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
        // name is absent (no active version join)
        name: undefined,
      };
      vi.mocked(deps.scorerRepo.findByIdWithVersion).mockResolvedValueOnce(row);
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce({
        id: 'ver-latest',
        name: 'Latest',
        type: 'llm',
        versionNumber: 2,
      } as never);

      const result = await service.getById('def-1');
      const data = assertOk(result);
      expect(data).toMatchObject({ name: 'Latest' });
      expect((data as Record<string, unknown>).versionId).toBe('ver-latest');
    });
  });

  describe('update', () => {
    it('updates and returns scorer', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.update).mockResolvedValueOnce({
        id: 'def-1',
        status: 'active',
      } as never);

      const result = await service.update('def-1', { status: 'active' });
      expect('data' in result).toBe(true);
      expect(deps.scorerStorage.update).toHaveBeenCalledWith({ id: 'def-1', status: 'active' });
    });

    it('returns not-found when scorer does not exist', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce(null as never);
      const result = await service.update('nonexistent', {});
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('delete', () => {
    it('deletes scorer and returns ok', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      const result = await service.delete('def-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.scorerStorage.delete).toHaveBeenCalledWith('def-1');
    });

    it('returns not-found when scorer does not exist', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce(null as never);
      const result = await service.delete('nonexistent');
      expect('error' in result).toBe(true);
    });
  });

  describe('listVersions', () => {
    it('returns paginated versions', async () => {
      vi.mocked(deps.scorerStorage.listVersions).mockResolvedValueOnce({
        rows: [
          { id: 'ver-1', scorer_definition_id: 'def-1', version_number: 1, name: 'V1' },
          { id: 'ver-2', scorer_definition_id: 'def-1', version_number: 2, name: 'V2' },
        ],
        total: 2,
        hasMore: false,
      } as never);

      const result = await service.listVersions('def-1', { page: 0, perPage: 10 });
      const data = assertOk(result);
      expect(data.versions).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.hasMore).toBe(false);
    });
  });

  describe('createVersion', () => {
    it('creates a new version with correct version number', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.countVersions).mockResolvedValueOnce(2 as never);
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce({
        name: 'Old',
        description: null,
        type: 'llm',
        model: null,
        instructions: 'old instructions',
        scoreRange: null,
      } as never);
      vi.mocked(deps.scorerStorage.createVersion).mockResolvedValueOnce({
        id: 'ver-3',
        scorerDefinitionId: 'def-1',
        versionNumber: 3,
        name: 'Updated',
      } as never);

      const result = await service.createVersion('def-1', {
        name: 'Updated',
        type: 'llm',
        instructions: 'new instructions',
      });

      expect('data' in result).toBe(true);
      expect(deps.scorerStorage.createVersion).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 3 }));
    });

    it('returns not-found when scorer does not exist', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce(null as never);
      const result = await service.createVersion('nonexistent', { name: 'X', type: 'llm' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('computes changed fields by diffing against previous version', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.countVersions).mockResolvedValueOnce(1 as never);
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce({
        name: 'Original',
        description: 'desc',
        type: 'llm',
        model: null,
        instructions: 'old',
        scoreRange: null,
      } as never);
      vi.mocked(deps.scorerStorage.createVersion).mockResolvedValueOnce({ id: 'ver-2' } as never);

      await service.createVersion('def-1', {
        name: 'Changed Name',
        description: 'desc',
        type: 'llm',
        instructions: 'new',
      });

      expect(deps.scorerStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          changedFields: expect.arrayContaining(['name', 'instructions']),
        }),
      );
    });
  });

  describe('publishVersion', () => {
    it('publishes the latest version when no versionId provided', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce({ id: 'ver-latest' } as never);
      vi.mocked(deps.scorerStorage.update).mockResolvedValueOnce({
        id: 'def-1',
        status: 'active',
        activeVersionId: 'ver-latest',
      } as never);

      const result = await service.publishVersion('def-1');
      expect('data' in result).toBe(true);
      expect(deps.scorerStorage.update).toHaveBeenCalledWith({
        id: 'def-1',
        status: 'active',
        activeVersionId: 'ver-latest',
      });
    });

    it('publishes a specific version when versionId provided', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.getVersion).mockResolvedValueOnce({ id: 'ver-2' } as never);
      vi.mocked(deps.scorerStorage.update).mockResolvedValueOnce({
        id: 'def-1',
        status: 'active',
        activeVersionId: 'ver-2',
      } as never);

      const result = await service.publishVersion('def-1', 'ver-2');
      expect('data' in result).toBe(true);
    });

    it('returns not-found when scorer does not exist', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce(null as never);
      const result = await service.publishVersion('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('returns validation-failed when no versions available', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce(null as never);

      const result = await service.publishVersion('def-1');
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns version-not-found when specified versionId does not exist', async () => {
      vi.mocked(deps.scorerStorage.getById).mockResolvedValueOnce({ id: 'def-1' } as never);
      vi.mocked(deps.scorerStorage.getVersion).mockResolvedValueOnce(null as never);

      const result = await service.publishVersion('def-1', 'nonexistent-ver');
      const error = assertErr(result);
      expect(error).toBe('version-not-found');
    });
  });

  describe('previewScore', () => {
    it('returns validation error when response is missing', async () => {
      const result = await service.previewScore('def-1', { response: '', context: [], question: 'test' }, () => ({}));
      const error = assertErr(result);
      expect(error).toBe('validation-failed');
    });

    it('returns validation error when question is missing', async () => {
      const result = await service.previewScore('def-1', { response: 'answer', context: [], question: '' }, () => ({}));
      expect('error' in result).toBe(true);
    });

    it('returns version-not-found when no version exists', async () => {
      vi.mocked(deps.scorerStorage.getLatestVersion).mockResolvedValueOnce(null as never);
      const result = await service.previewScore(
        'def-1',
        { response: 'answer', context: [], question: 'what?' },
        () => ({}),
      );
      const error = assertErr(result);
      expect(error).toBe('version-not-found');
    });
  });
});
