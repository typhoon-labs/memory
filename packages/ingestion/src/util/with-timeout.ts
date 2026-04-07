/**
 * Stage-scoped timeout helper for the ingestion pipeline.
 *
 * Wraps a single async operation with a deadline so a hung external call
 * (download, LLM, embedding, db) fails fast with a labelled error instead of
 * burning the entire job's time budget. Note: like all `Promise.race`-based
 * timeouts, this only rejects the wrapper — the underlying promise keeps
 * running until it completes or the process exits. The handler that catches
 * the timeout is responsible for not relying on the underlying call's
 * eventual outcome.
 */
export class StageTimeoutError extends Error {
  constructor(
    public readonly stage: string,
    public readonly ms: number,
  ) {
    super(`Stage "${stage}" exceeded ${ms}ms timeout`);
    this.name = 'StageTimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new StageTimeoutError(stage, ms)), ms);
    }),
  ]);
}
