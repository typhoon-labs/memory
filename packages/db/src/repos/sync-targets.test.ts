import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSyncTargetNames } from './sync-targets';

function createMockDb() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const makeChain = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get(_, prop) {
        if (prop === 'then') return undefined;
        chain[prop as string] ??= vi.fn().mockReturnValue(makeChain());
        return chain[prop as string];
      },
    });

  const db = {
    select: vi.fn().mockReturnValue(makeChain()),
    _chain: chain,
  };

  return db;
}

describe('getSyncTargetNames', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns empty map for empty ids', async () => {
    const result = await getSyncTargetNames(db as any, []);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns map of id to name', async () => {
    const rows = [
      { id: 'st-1', name: 'Source A' },
      { id: 'st-2', name: 'Source B' },
    ];
    db._chain.where = vi.fn().mockResolvedValue(rows);

    const result = await getSyncTargetNames(db as any, ['st-1', 'st-2']);
    expect(result.get('st-1')).toBe('Source A');
    expect(result.get('st-2')).toBe('Source B');
    expect(result.size).toBe(2);
  });
});
