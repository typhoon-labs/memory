/**
 * Simple in-process rate limiter using a semaphore pattern. Limits both
 * concurrency and minimum interval between acquisitions. Used to throttle
 * embedding API calls within a single worker process.
 *
 * For cross-process coordination, pair this with BullMQ's queue-level
 * `limiter` option.
 */
export interface RateLimiter {
  acquire(): Promise<void>;
  release(): void;
}

export function createRateLimiter(opts: { maxConcurrent: number; minIntervalMs: number }): RateLimiter {
  let active = 0;
  let lastAcquireTime = 0;
  const waitQueue: Array<() => void> = [];

  function tryRelease() {
    if (waitQueue.length > 0 && active < opts.maxConcurrent) {
      const next = waitQueue.shift();
      if (next) next();
    }
  }

  async function acquire(): Promise<void> {
    // Wait for a slot
    if (active >= opts.maxConcurrent) {
      await new Promise<void>((resolve) => waitQueue.push(resolve));
    }

    // Enforce minimum interval between acquisitions
    const now = Date.now();
    const elapsed = now - lastAcquireTime;
    if (elapsed < opts.minIntervalMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, opts.minIntervalMs - elapsed));
    }

    active++;
    lastAcquireTime = Date.now();
  }

  function release(): void {
    active = Math.max(0, active - 1);
    tryRelease();
  }

  return { acquire, release };
}
