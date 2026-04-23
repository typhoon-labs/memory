/**
 * Shared logger mock — auto-applied via vitest `setupFiles`.
 *
 * Replaces `@typhoon/logger` with a no-op logger so tests don't produce
 * console output and don't require the real logger dependency.
 */
import { vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
