/**
 * Shared mock factories for API unit tests.
 *
 * These helpers produce consistent mock rows that mirror the database schema
 * so individual test files don't need to duplicate object literals.
 *
 * Usage:
 *   import { makeThread, makeDocument, mockAuthMiddleware } from '../../tests/helpers/api-test-utils';
 */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Row factories
// ---------------------------------------------------------------------------

/** Creates a mock thread row (mirrors packages/db/src/schema/threads.ts). */
export function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thread-uuid-1',
    externalId: 'ext-thread-1',
    resourceId: 'user-1',
    title: '',
    metadata: {},
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Creates a mock message row (mirrors packages/db/src/schema/messages.ts). */
export function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-uuid-1',
    externalId: 'ext-message-1',
    threadId: 'thread-uuid-1',
    role: 'user',
    type: 'text',
    content: { content: 'Hello' },
    resourceId: 'user-1',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Creates a mock document row (mirrors packages/db/src/schema/document.ts). */
export function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-uuid-1',
    syncTargetId: 'st-uuid-1',
    sourceKey: 'docs/test.pdf',
    sourceEtag: '"abc123"',
    mimeType: 'application/pdf',
    fileSize: 1024,
    title: 'Test Document',
    description: null,
    author: null,
    pageCount: 1,
    status: 'ready',
    errorMessage: null,
    chunkCount: 5,
    contentHash: 'hash-abc',
    lastSyncedAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Creates a mock sync target row (mirrors packages/db/src/schema/sync-target.ts). */
export function makeSyncTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st-uuid-1',
    name: 'Test Source',
    sourceType: 's3',
    config: { bucket: 'test-bucket', prefix: 'docs/' },
    cronSchedule: '0 */6 * * *',
    isActive: true,
    managedBy: null,
    source: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Middleware mock factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hono-compatible auth middleware mock that sets `user` and `session`
 * on the context, bypassing the real Better Auth session lookup.
 *
 * Usage:
 *   vi.mock('../middleware/require-auth', () => ({
 *     requireAuth: mockAuthMiddleware('user-42'),
 *   }));
 */
export function mockAuthMiddleware(userId = 'user-1') {
  return vi.fn(async (c: { set(key: string, value: unknown): void }, next: () => Promise<void>) => {
    c.set('user', { id: userId, email: `${userId}@test.example` });
    c.set('session', { id: `session-${userId}`, userId });
    await next();
  });
}

// ---------------------------------------------------------------------------
// Chainable Drizzle query mock
// ---------------------------------------------------------------------------

/**
 * Returns a chainable mock that mimics Drizzle's fluent query builder API.
 * The final `await` resolves to `result`.
 *
 * Usage:
 *   mockDb.select.mockReturnValue(chainable([makeThread()]));
 *   mockDb.insert.mockReturnValue(chainable([makeThread({ title: 'New' })]));
 */
export function chainable(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'set',
    'values',
    'returning',
    'innerJoin',
    'leftJoin',
    'groupBy',
    'having',
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Drizzle query chain
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve));
  return chain;
}
