import { z } from 'zod';

// =============================================================================
// Core types
// =============================================================================

export const metadataFieldTypeEnum = z.enum(['string', 'number', 'boolean', 'string[]']);

export type MetadataFieldType = z.infer<typeof metadataFieldTypeEnum>;

export const metadataFieldDefinitionSchema = z.object({
  type: metadataFieldTypeEnum,
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  allowedValues: z.array(z.unknown()).optional(),
  description: z.string().optional(),
});

export type MetadataFieldDefinition = z.infer<typeof metadataFieldDefinitionSchema>;

export const metadataSchemaSchema = z.record(z.string(), metadataFieldDefinitionSchema);

export type MetadataSchema = z.infer<typeof metadataSchemaSchema>;

// =============================================================================
// Field group & template Zod schemas (for API validation)
// =============================================================================

export const createMetadataFieldGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  fields: metadataSchemaSchema,
});

export const updateMetadataFieldGroupSchema = createMetadataFieldGroupSchema.partial();

export const createMetadataTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  fieldGroupIds: z.array(z.string().uuid()).default([]),
  customFields: metadataSchemaSchema.default({}),
});

export const updateMetadataTemplateSchema = createMetadataTemplateSchema.partial();

// =============================================================================
// Reserved metadata keys
// =============================================================================

/**
 * Keys used internally by the vector chunk metadata. Custom metadata must not
 * use any of these to avoid overwriting core search/retrieval fields.
 */
const RESERVED_METADATA_KEYS = new Set([
  'text',
  'documentId',
  'syncTargetId',
  'source',
  'title',
  'section',
  'keywords',
  'startIndex',
]);

// =============================================================================
// Schema resolution
// =============================================================================

/**
 * Merges fields from referenced groups + template-specific custom fields into a
 * single effective schema. Groups are applied in order; later groups and custom
 * fields override earlier ones on name collision.
 */
export function resolveTemplateSchema(
  template: { fieldGroupIds: string[]; customFields: MetadataSchema },
  groups: Array<{ id: string; fields: MetadataSchema }>,
): MetadataSchema {
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const merged: MetadataSchema = {};

  for (const groupId of template.fieldGroupIds) {
    const group = groupMap.get(groupId);
    if (group) {
      Object.assign(merged, group.fields);
    }
  }

  Object.assign(merged, template.customFields);
  return merged;
}

// =============================================================================
// Defaults
// =============================================================================

/**
 * Builds a Zod object schema from a MetadataSchema for use with `generateObject`.
 * All fields are optional since extraction may not find every value.
 */
export function buildZodFromMetadataSchema(
  schema: MetadataSchema,
): z.ZodObject<Record<string, z.ZodOptional<z.ZodTypeAny>>> {
  const shape: Record<string, z.ZodOptional<z.ZodTypeAny>> = {};
  for (const [key, field] of Object.entries(schema)) {
    let fieldSchema: z.ZodTypeAny;
    if (field.allowedValues && field.allowedValues.length > 0) {
      const vals = field.allowedValues.map(String) as [string, ...string[]];
      fieldSchema = z.enum(vals);
    } else {
      switch (field.type) {
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'string[]':
          fieldSchema = z.array(z.string());
          break;
        default:
          fieldSchema = z.string();
          break;
      }
    }
    if (field.description) {
      fieldSchema = fieldSchema.describe(field.description);
    }
    shape[key] = fieldSchema.optional();
  }
  return z.object(shape);
}

/**
 * Extracts all default values from a metadata schema, returning a record ready
 * to be used as baseline `customMetadata` for new documents.
 */
export function applySchemaDefaults(schema: MetadataSchema): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (field.default !== undefined) {
      defaults[key] = field.default;
    }
  }
  return defaults;
}

// =============================================================================
// Validation
// =============================================================================

export interface MetadataValidationResult {
  valid: boolean;
  errors: string[];
  /** The normalized data with defaults applied and types coerced. */
  normalized: Record<string, unknown>;
}

/**
 * Validates user-supplied custom metadata against a schema. Applies defaults for
 * missing optional fields. Returns validation errors for:
 * - Missing required fields
 * - Type mismatches
 * - Values not in allowedValues
 * - Reserved key usage
 */
export function validateCustomMetadata(
  data: Record<string, unknown>,
  schema: MetadataSchema,
): MetadataValidationResult {
  const errors: string[] = [];
  const normalized: Record<string, unknown> = {};

  // Check for reserved keys in user data
  for (const key of Object.keys(data)) {
    if (RESERVED_METADATA_KEYS.has(key)) {
      errors.push(`"${key}" is a reserved metadata key and cannot be used`);
    }
  }

  // Validate schema-defined fields
  for (const [key, field] of Object.entries(schema)) {
    if (RESERVED_METADATA_KEYS.has(key)) {
      errors.push(`Schema field "${key}" conflicts with a reserved metadata key`);
      continue;
    }

    const value = data[key];

    if (value === undefined || value === null) {
      if (field.required) {
        errors.push(`"${key}" is required`);
      } else if (field.default !== undefined) {
        normalized[key] = field.default;
      }
      continue;
    }

    // Type validation
    const typeError = validateFieldType(key, value, field.type);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    // Allowed values validation
    if (field.allowedValues && field.allowedValues.length > 0) {
      if (field.type === 'string[]') {
        const arr = value as unknown[];
        const invalid = arr.filter((v) => !field.allowedValues?.includes(v));
        if (invalid.length > 0) {
          errors.push(
            `"${key}" contains invalid values: ${JSON.stringify(invalid)}. Allowed: ${JSON.stringify(field.allowedValues)}`,
          );
          continue;
        }
      } else if (!field.allowedValues.includes(value)) {
        errors.push(
          `"${key}" value ${JSON.stringify(value)} is not allowed. Allowed: ${JSON.stringify(field.allowedValues)}`,
        );
        continue;
      }
    }

    normalized[key] = value;
  }

  // Non-schema keys are silently stripped — only template-defined fields are kept

  return { valid: errors.length === 0, errors, normalized };
}

function validateFieldType(key: string, value: unknown, expectedType: MetadataFieldType): string | null {
  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string') {
        return `"${key}" must be a string, got ${typeof value}`;
      }
      return null;
    case 'number':
      if (typeof value !== 'number') {
        return `"${key}" must be a number, got ${typeof value}`;
      }
      return null;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return `"${key}" must be a boolean, got ${typeof value}`;
      }
      return null;
    case 'string[]':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        return `"${key}" must be an array of strings`;
      }
      return null;
    default:
      return `"${key}" has unknown type "${expectedType as string}"`;
  }
}
