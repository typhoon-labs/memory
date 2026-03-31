/**
 * Source Registry — Named credential sources for S3/MinIO connectors.
 *
 * Sources are registered at application startup from code (referencing env
 * vars). Sync targets in the database reference a source by name —
 * credentials never touch the database.
 */

import { z } from 'zod';

const s3CredentialsSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
  region: z.string().min(1, 'region is required'),
  accessKey: z.string().min(1, 'accessKey is required'),
  secretKey: z.string().min(1, 'secretKey is required'),
});

const s3SourceSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  credentials: s3CredentialsSchema,
});

export type S3Credentials = z.infer<typeof s3CredentialsSchema>;

export interface S3Source {
  readonly name: string;
  readonly credentials: S3Credentials;
}

const registry = new Map<string, S3Source>();

/** Register a named credential source. Validates credentials and throws on error. */
export function registerSource(raw: { name: string; credentials: Record<string, string> }): void {
  const result = s3SourceSchema.safeParse(raw);
  if (!result.success) {
    const name = raw.name || '(unnamed)';
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Source "${name}" has invalid config: ${issues}`);
  }

  const source = result.data;
  if (registry.has(source.name)) {
    throw new Error(`Source "${source.name}" is already registered`);
  }
  registry.set(source.name, source);
}

export function getSource(name: string): S3Source | undefined {
  return registry.get(name);
}

export function listSources(): S3Source[] {
  return [...registry.values()];
}

/** Clears all registered sources. Primarily for testing. */
export function clearSourceRegistry(): void {
  registry.clear();
}
