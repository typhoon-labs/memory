import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';

describe('createRateLimiter', () => {
  it('allows up to maxConcurrent acquisitions', async () => {
    const limiter = createRateLimiter({ maxConcurrent: 2, minIntervalMs: 0 });

    await limiter.acquire();
    await limiter.acquire();

    // Third acquire should block — verify by racing with a timeout
    let thirdResolved = false;
    const thirdPromise = limiter.acquire().then(() => {
      thirdResolved = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(thirdResolved).toBe(false);

    // Release one slot — third should now resolve
    limiter.release();
    await thirdPromise;
    expect(thirdResolved).toBe(true);

    limiter.release();
    limiter.release();
  });

  it('enforces minIntervalMs between acquisitions', async () => {
    const limiter = createRateLimiter({ maxConcurrent: 10, minIntervalMs: 100 });

    const t0 = Date.now();
    await limiter.acquire();
    limiter.release();

    await limiter.acquire();
    const elapsed = Date.now() - t0;
    limiter.release();

    // Second acquire should have waited at least ~100ms
    expect(elapsed).toBeGreaterThanOrEqual(80); // allow small timing variance
  });

  it('release is safe to call more times than acquire', () => {
    const limiter = createRateLimiter({ maxConcurrent: 1, minIntervalMs: 0 });
    // Should not throw
    limiter.release();
    limiter.release();
  });
});
