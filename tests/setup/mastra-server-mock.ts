/**
 * Shared Mastra server mock — auto-applied via vitest `setupFiles`.
 *
 * Replaces `registerApiRoute` with a passthrough that returns the route
 * config as a plain object, so tests can mount routes on a Hono app.
 */
import { vi } from 'vitest';

vi.mock('@mastra/core/server', () => ({
  registerApiRoute: (path: string, opts: Record<string, unknown>) => ({ path, ...opts }),
}));
