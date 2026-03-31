/**
 * Sync Target Registry — Code-defined sync targets with validation.
 *
 * Targets are registered at application startup with Zod validation
 * of the config shape and source reference check. The registry is then
 * reconciled to the database. Server refuses to start with bad config.
 */

import type { ConfigSyncTarget, ConfigSyncTargetInput } from '@typhoon/types';
import { configSyncTargetSchema, syncTargetConfigSchemas } from '@typhoon/types';
import { getSource } from './source-registry.js';

const registry = new Map<string, ConfigSyncTarget>();

/** Register a sync target with full validation. Throws on any error. */
export function registerSyncTarget(raw: ConfigSyncTargetInput): void {
  const result = configSyncTargetSchema.safeParse(raw);
  if (!result.success) {
    const name = (raw as { name?: string }).name || '(unnamed)';
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Sync target "${name}" has invalid config: ${issues}`);
  }

  const target = result.data;

  if (registry.has(target.name)) {
    throw new Error(`Sync target "${target.name}" is already registered`);
  }

  if (!getSource(target.source)) {
    throw new Error(`Sync target "${target.name}" references unknown source "${target.source}"`);
  }

  // Validate config against per-source-type schema
  const configSchema = syncTargetConfigSchemas[target.sourceType];
  if (!configSchema) {
    throw new Error(`Sync target "${target.name}" has unknown sourceType "${target.sourceType}"`);
  }

  const configResult = configSchema.safeParse(target.config);
  if (!configResult.success) {
    const issues = configResult.error.issues.map((i) => `config.${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Sync target "${target.name}" has invalid ${target.sourceType} config: ${issues}`);
  }

  // Store with parsed/defaulted config (e.g. prefix defaults applied)
  registry.set(target.name, { ...target, config: configResult.data as Record<string, unknown> });
}

export function listRegisteredSyncTargets(): ConfigSyncTarget[] {
  return [...registry.values()];
}

/** Clears all registered sync targets. Primarily for testing. */
export function clearSyncTargetRegistry(): void {
  registry.clear();
}
