import { describe, expect, it } from 'vitest';

import {
  configSyncTargetSchema,
  createSyncTargetSchema,
  syncTargetConfigSchemas,
  syncTargetSchema,
  updateSyncTargetSchema,
} from './sync-target';

// =============================================================================
// syncTargetConfigSchemas
// =============================================================================

describe('syncTargetConfigSchemas', () => {
  it('has s3 schema', () => {
    expect(syncTargetConfigSchemas.s3).toBeDefined();
  });

  it('returns undefined for unknown source type', () => {
    expect(syncTargetConfigSchemas['gcs']).toBeUndefined();
  });
});

// =============================================================================
// s3ConfigSchema (via syncTargetConfigSchemas.s3)
// =============================================================================

describe('s3ConfigSchema', () => {
  const s3Schema = syncTargetConfigSchemas.s3 as import('zod').ZodType;

  it('parses with explicit prefix', () => {
    const result = s3Schema.parse({ prefix: 'docs/' });
    expect(result).toEqual({ prefix: 'docs/' });
  });

  it('defaults prefix to empty string', () => {
    const result = s3Schema.parse({});
    expect(result).toEqual({ prefix: '' });
  });

  it('rejects extra keys (strict mode)', () => {
    expect(s3Schema.safeParse({ prefix: '', bucket: 'mybucket' }).success).toBe(false);
  });
});

// =============================================================================
// syncTargetSchema
// =============================================================================

describe('syncTargetSchema', () => {
  const validTarget = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'My Docs',
    sourceType: 's3',
    config: { prefix: 'docs/' },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  it('parses minimal valid target with defaults', () => {
    const result = syncTargetSchema.parse(validTarget);
    expect(result.name).toBe('My Docs');
    expect(result.cronSchedule).toBe('0 */6 * * *');
    expect(result.isActive).toBe(true);
    expect(result.managedBy).toBeNull();
    expect(result.source).toBeNull();
    expect(result.metadataTemplateId).toBeNull();
    expect(result.autoExtractMetadata).toBe(false);
  });

  it('parses full target', () => {
    const full = {
      ...validTarget,
      cronSchedule: '0 0 * * *',
      isActive: false,
      managedBy: 'config' as const,
      source: 'prod-s3',
      metadataTemplateId: '550e8400-e29b-41d4-a716-446655440001',
      autoExtractMetadata: true,
    };
    const result = syncTargetSchema.parse(full);
    expect(result.cronSchedule).toBe('0 0 * * *');
    expect(result.isActive).toBe(false);
    expect(result.managedBy).toBe('config');
    expect(result.source).toBe('prod-s3');
    expect(result.autoExtractMetadata).toBe(true);
  });

  it('rejects invalid uuid for id', () => {
    expect(syncTargetSchema.safeParse({ ...validTarget, id: 'bad' }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(syncTargetSchema.safeParse({ ...validTarget, name: '' }).success).toBe(false);
  });

  it('rejects empty sourceType', () => {
    expect(syncTargetSchema.safeParse({ ...validTarget, sourceType: '' }).success).toBe(false);
  });

  it('rejects invalid managedBy value', () => {
    expect(syncTargetSchema.safeParse({ ...validTarget, managedBy: 'auto' }).success).toBe(false);
  });

  it('accepts null managedBy', () => {
    const result = syncTargetSchema.parse({ ...validTarget, managedBy: null });
    expect(result.managedBy).toBeNull();
  });

  it('rejects invalid uuid for metadataTemplateId', () => {
    expect(syncTargetSchema.safeParse({ ...validTarget, metadataTemplateId: 'bad' }).success).toBe(false);
  });
});

// =============================================================================
// cronSchedule refinement
// =============================================================================

describe('cronSchedule', () => {
  it('accepts standard 5-field cron', () => {
    const result = syncTargetSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'test',
      sourceType: 's3',
      config: {},
      cronSchedule: '*/15 * * * *',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects human-readable cron', () => {
    const result = syncTargetSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'test',
      sourceType: 's3',
      config: {},
      cronSchedule: 'every 6 hours',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects 6-field cron (seconds)', () => {
    const result = syncTargetSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'test',
      sourceType: 's3',
      config: {},
      cronSchedule: '0 0 */6 * * *',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it('defaults to every 6 hours', () => {
    const result = syncTargetSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'test',
      sourceType: 's3',
      config: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.cronSchedule).toBe('0 */6 * * *');
  });
});

// =============================================================================
// createSyncTargetSchema
// =============================================================================

describe('createSyncTargetSchema', () => {
  const validCreate = {
    name: 'New Source',
    sourceType: 's3',
    config: { prefix: '' },
  };

  it('parses valid create input', () => {
    const result = createSyncTargetSchema.parse(validCreate);
    expect(result.name).toBe('New Source');
    expect(result.isActive).toBe(true);
    expect(result.cronSchedule).toBe('0 */6 * * *');
  });

  it('omits id, createdAt, updatedAt', () => {
    const withExtra = {
      ...validCreate,
      id: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = createSyncTargetSchema.parse(withExtra);
    expect((result as Record<string, unknown>).id).toBeUndefined();
    expect((result as Record<string, unknown>).createdAt).toBeUndefined();
    expect((result as Record<string, unknown>).updatedAt).toBeUndefined();
  });

  it('rejects missing required fields', () => {
    expect(createSyncTargetSchema.safeParse({}).success).toBe(false);
  });
});

// =============================================================================
// updateSyncTargetSchema
// =============================================================================

describe('updateSyncTargetSchema', () => {
  it('accepts partial update', () => {
    const result = updateSyncTargetSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('accepts empty object (applies defaults for fields with defaults)', () => {
    const result = updateSyncTargetSchema.parse({});
    // .partial() makes fields optional but defaults still apply
    expect(result.cronSchedule).toBe('0 */6 * * *');
    expect(result.isActive).toBe(true);
    expect(result.autoExtractMetadata).toBe(false);
  });

  it('accepts only cronSchedule', () => {
    const result = updateSyncTargetSchema.parse({ cronSchedule: '0 0 * * *' });
    expect(result.cronSchedule).toBe('0 0 * * *');
  });
});

// =============================================================================
// configSyncTargetSchema
// =============================================================================

describe('configSyncTargetSchema', () => {
  const validConfig = {
    name: 'Prod Docs',
    source: 'prod-s3',
    sourceType: 's3',
    config: { prefix: 'docs/' },
  };

  it('parses valid config target', () => {
    const result = configSyncTargetSchema.parse(validConfig);
    expect(result.name).toBe('Prod Docs');
    expect(result.source).toBe('prod-s3');
    expect(result.isActive).toBe(true);
  });

  it('trims whitespace from string fields', () => {
    const result = configSyncTargetSchema.parse({
      ...validConfig,
      name: '  Trimmed  ',
      source: '  src  ',
      sourceType: '  s3  ',
    });
    expect(result.name).toBe('Trimmed');
    expect(result.source).toBe('src');
    expect(result.sourceType).toBe('s3');
  });

  it('rejects whitespace-only name after trim', () => {
    expect(configSyncTargetSchema.safeParse({ ...validConfig, name: '   ' }).success).toBe(false);
  });

  it('rejects whitespace-only source after trim', () => {
    expect(configSyncTargetSchema.safeParse({ ...validConfig, source: '   ' }).success).toBe(false);
  });

  it('rejects whitespace-only sourceType after trim', () => {
    expect(configSyncTargetSchema.safeParse({ ...validConfig, sourceType: '   ' }).success).toBe(false);
  });

  it('defaults isActive to true', () => {
    const result = configSyncTargetSchema.parse(validConfig);
    expect(result.isActive).toBe(true);
  });

  it('accepts explicit isActive false', () => {
    const result = configSyncTargetSchema.parse({ ...validConfig, isActive: false });
    expect(result.isActive).toBe(false);
  });
});
