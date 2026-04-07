/**
 * Source Registry — Named credential sources for sync connectors.
 *
 * Sources are registered at application startup from code (referencing env
 * vars). Sync targets in the database reference a source by name —
 * credentials never touch the database.
 *
 * The registry is source-type agnostic. Each provider is responsible for
 * validating that the credentials it receives are correct for its type.
 */

export interface NamedSource {
  readonly name: string;
  readonly sourceType: string;
  readonly credentials: Record<string, string>;
}

const registry = new Map<string, NamedSource>();

/** Register a named credential source. */
export function registerSource(raw: { name: string; sourceType: string; credentials: Record<string, string> }): void {
  if (!raw.name?.trim()) throw new Error('Source name is required');
  if (!raw.sourceType?.trim()) throw new Error('Source sourceType is required');

  const name = raw.name.trim();
  if (registry.has(name)) {
    throw new Error(`Source "${name}" is already registered`);
  }
  registry.set(name, { name, sourceType: raw.sourceType, credentials: raw.credentials });
}

export function getSource(name: string): NamedSource | undefined {
  return registry.get(name);
}

export function listSources(): NamedSource[] {
  return [...registry.values()];
}

/** Clears all registered sources. Primarily for testing. */
export function clearSourceRegistry(): void {
  registry.clear();
}
