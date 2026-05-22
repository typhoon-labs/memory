/** Metadata field type. */
export type MetadataFieldType = 'string' | 'number' | 'boolean' | 'string[]';

/** A single metadata field definition. */
export interface MetadataFieldDefinition {
  type: MetadataFieldType;
  required?: boolean;
  default?: unknown;
  allowedValues?: unknown[];
  description?: string;
}

/** A metadata field schema (key -> definition). */
export type MetadataSchema = Record<string, MetadataFieldDefinition>;

/** A metadata field group. */
export interface MetadataFieldGroup {
  id: string;
  name: string;
  description: string | null;
  fields: MetadataSchema;
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /v1/metadata-field-groups. */
export interface CreateFieldGroupInput {
  name: string;
  description?: string | null;
  fields: MetadataSchema;
}

/** Payload for PATCH /v1/metadata-field-groups/:id. */
export type UpdateFieldGroupInput = Partial<CreateFieldGroupInput>;

/** A metadata template. */
export interface MetadataTemplate {
  id: string;
  name: string;
  description: string | null;
  fieldGroupIds: string[];
  customFields: MetadataSchema;
  effectiveSchema?: MetadataSchema;
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /v1/metadata-templates. */
export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  fieldGroupIds?: string[];
  customFields?: MetadataSchema;
}

/** Payload for PATCH /v1/metadata-templates/:id. */
export type UpdateTemplateInput = Partial<CreateTemplateInput>;
