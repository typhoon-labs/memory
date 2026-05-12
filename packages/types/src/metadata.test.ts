import { describe, expect, it } from 'vitest';
import type { MetadataSchema } from './metadata';
import {
  applySchemaDefaults,
  buildZodFromMetadataSchema,
  createMetadataFieldGroupSchema,
  createMetadataTemplateSchema,
  resolveTemplateSchema,
  validateCustomMetadata,
} from './metadata';

// =============================================================================
// resolveTemplateSchema
// =============================================================================

describe('resolveTemplateSchema', () => {
  it('merges group fields in order', () => {
    const groups: Array<{ id: string; fields: MetadataSchema }> = [
      { id: 'g1', fields: { country: { type: 'string', required: true } } },
      { id: 'g2', fields: { product: { type: 'string' } } },
    ];
    const template = { fieldGroupIds: ['g1', 'g2'], customFields: {} };

    const result = resolveTemplateSchema(template, groups);
    expect(result).toEqual({
      country: { type: 'string', required: true },
      product: { type: 'string' },
    });
  });

  it('later groups override earlier on collision', () => {
    const groups: Array<{ id: string; fields: MetadataSchema }> = [
      { id: 'g1', fields: { region: { type: 'string', required: false } } },
      { id: 'g2', fields: { region: { type: 'string', required: true } } },
    ];
    const template = { fieldGroupIds: ['g1', 'g2'], customFields: {} };

    const result = resolveTemplateSchema(template, groups);
    expect(result.region.required).toBe(true);
  });

  it('custom fields override group fields', () => {
    const groups: Array<{ id: string; fields: MetadataSchema }> = [
      { id: 'g1', fields: { country: { type: 'string' } } },
    ];
    const template = {
      fieldGroupIds: ['g1'],
      customFields: { country: { type: 'string' as const, required: true, allowedValues: ['US', 'DE'] } },
    };

    const result = resolveTemplateSchema(template, groups);
    expect(result.country.required).toBe(true);
    expect(result.country.allowedValues).toEqual(['US', 'DE']);
  });

  it('skips missing groups gracefully', () => {
    const groups: Array<{ id: string; fields: MetadataSchema }> = [{ id: 'g1', fields: { a: { type: 'string' } } }];
    const template = { fieldGroupIds: ['g1', 'missing-id'], customFields: {} };

    const result = resolveTemplateSchema(template, groups);
    expect(Object.keys(result)).toEqual(['a']);
  });

  it('handles empty template', () => {
    const result = resolveTemplateSchema({ fieldGroupIds: [], customFields: {} }, []);
    expect(result).toEqual({});
  });
});

// =============================================================================
// applySchemaDefaults
// =============================================================================

describe('applySchemaDefaults', () => {
  it('extracts default values', () => {
    const schema: MetadataSchema = {
      country: { type: 'string', default: 'US' },
      state: { type: 'string' },
      active: { type: 'boolean', default: true },
    };
    expect(applySchemaDefaults(schema)).toEqual({ country: 'US', active: true });
  });

  it('returns empty for schema with no defaults', () => {
    const schema: MetadataSchema = {
      country: { type: 'string', required: true },
    };
    expect(applySchemaDefaults(schema)).toEqual({});
  });
});

// =============================================================================
// validateCustomMetadata
// =============================================================================

describe('validateCustomMetadata', () => {
  const schema: MetadataSchema = {
    country: { type: 'string', required: true, allowedValues: ['US', 'DE', 'UK'] },
    state: { type: 'string' },
    priority: { type: 'number' },
    active: { type: 'boolean', default: true },
    tags: { type: 'string[]', allowedValues: ['legal', 'support', 'faq'] },
  };

  it('validates correct data', () => {
    const result = validateCustomMetadata({ country: 'US', state: 'California', priority: 1, tags: ['legal'] }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalized.country).toBe('US');
    expect(result.normalized.active).toBe(true); // default applied
  });

  it('fails on missing required field', () => {
    const result = validateCustomMetadata({ state: 'California' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"country" is required');
  });

  it('fails on wrong type', () => {
    const result = validateCustomMetadata({ country: 'US', priority: 'high' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"priority" must be a number'))).toBe(true);
  });

  it('fails on disallowed value', () => {
    const result = validateCustomMetadata({ country: 'FR' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"country"') && e.includes('not allowed'))).toBe(true);
  });

  it('fails on disallowed array values', () => {
    const result = validateCustomMetadata({ country: 'US', tags: ['legal', 'billing'] }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"tags"') && e.includes('billing'))).toBe(true);
  });

  it('rejects reserved keys', () => {
    const result = validateCustomMetadata({ country: 'US', documentId: 'hacked' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reserved'))).toBe(true);
  });

  it('strips non-schema keys', () => {
    const result = validateCustomMetadata({ country: 'US', customField: 'hello' }, schema);
    expect(result.valid).toBe(true);
    expect(result.normalized.customField).toBeUndefined();
  });

  it('applies defaults for missing optional fields', () => {
    const result = validateCustomMetadata({ country: 'US' }, schema);
    expect(result.valid).toBe(true);
    expect(result.normalized.active).toBe(true);
  });

  it('does not override provided values with defaults', () => {
    const result = validateCustomMetadata({ country: 'US', active: false }, schema);
    expect(result.valid).toBe(true);
    expect(result.normalized.active).toBe(false);
  });

  it('strips all keys when schema is empty', () => {
    const result = validateCustomMetadata({ anything: 'goes' }, {});
    expect(result.valid).toBe(true);
    expect(result.normalized).toEqual({});
  });
});

// =============================================================================
// buildZodFromMetadataSchema
// =============================================================================

describe('buildZodFromMetadataSchema', () => {
  it('builds a Zod schema with correct types', () => {
    const schema: MetadataSchema = {
      name: { type: 'string' },
      count: { type: 'number' },
      active: { type: 'boolean' },
      tags: { type: 'string[]' },
    };
    const zod = buildZodFromMetadataSchema(schema);
    const result = zod.safeParse({ name: 'test', count: 5, active: true, tags: ['a'] });
    expect(result.success).toBe(true);
  });

  it('makes all fields optional', () => {
    const schema: MetadataSchema = { name: { type: 'string', required: true } };
    const zod = buildZodFromMetadataSchema(schema);
    const result = zod.safeParse({});
    expect(result.success).toBe(true);
  });

  it('uses z.enum for fields with allowedValues', () => {
    const schema: MetadataSchema = { region: { type: 'string', allowedValues: ['us', 'eu'] } };
    const zod = buildZodFromMetadataSchema(schema);
    expect(zod.safeParse({ region: 'us' }).success).toBe(true);
    expect(zod.safeParse({ region: 'invalid' }).success).toBe(false);
  });
});

// =============================================================================
// Zod schemas
// =============================================================================

describe('createMetadataFieldGroupSchema', () => {
  it('validates correct input', () => {
    const result = createMetadataFieldGroupSchema.safeParse({
      name: 'Region',
      fields: {
        country: { type: 'string', required: true, allowedValues: ['US', 'DE'] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createMetadataFieldGroupSchema.safeParse({
      name: '',
      fields: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid field type', () => {
    const result = createMetadataFieldGroupSchema.safeParse({
      name: 'Bad',
      fields: {
        x: { type: 'date' },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('createMetadataTemplateSchema', () => {
  it('validates correct input', () => {
    const result = createMetadataTemplateSchema.safeParse({
      name: 'US Legal',
      fieldGroupIds: ['550e8400-e29b-41d4-a716-446655440000'],
      customFields: {
        jurisdiction: { type: 'string', required: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it('defaults fieldGroupIds and customFields', () => {
    const result = createMetadataTemplateSchema.parse({ name: 'Minimal' });
    expect(result.fieldGroupIds).toEqual([]);
    expect(result.customFields).toEqual({});
  });
});
