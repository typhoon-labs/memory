import { describe, expect, it, vi } from 'vitest';
import { emitToolProgress, withProgress } from './with-progress';

function makeContext(toolCallId?: string) {
  return {
    agent: toolCallId ? { toolCallId } : undefined,
    writer: { custom: vi.fn() },
  };
}

describe('emitToolProgress', () => {
  it('calls writer.custom with correct payload', async () => {
    const ctx = makeContext('tc-1');
    await emitToolProgress(ctx as never, 'Searching...', 'in-progress');
    expect(ctx.writer.custom).toHaveBeenCalledWith({
      type: 'data-tool-progress',
      data: { toolCallId: 'tc-1', message: 'Searching...', status: 'in-progress' },
      transient: false,
    });
  });

  it('defaults status to in-progress', async () => {
    const ctx = makeContext('tc-1');
    await emitToolProgress(ctx as never, 'Working...');
    expect(ctx.writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'in-progress' }),
      }),
    );
  });

  it('no-ops when context is undefined', async () => {
    await emitToolProgress(undefined, 'msg');
    // No error thrown
  });

  it('no-ops when toolCallId is missing', async () => {
    const ctx = makeContext(undefined);
    await emitToolProgress(ctx as never, 'msg');
    expect(ctx.writer.custom).not.toHaveBeenCalled();
  });

  it('no-ops when writer is missing', async () => {
    const ctx = { agent: { toolCallId: 'tc-1' } };
    await emitToolProgress(ctx as never, 'msg');
    // No error thrown
  });
});

describe('withProgress', () => {
  it('emits start message before execution', async () => {
    const callOrder: string[] = [];
    const inner = {
      execute: vi.fn(async () => {
        callOrder.push('execute');
        return 'result';
      }),
    };
    const ctx = makeContext('tc-1');

    // Intercept custom calls to track order
    ctx.writer.custom.mockImplementation(async () => {
      callOrder.push('progress');
    });

    const wrapped = withProgress(inner, { start: 'Starting...' });
    await wrapped.execute?.('input', ctx);

    expect(callOrder[0]).toBe('progress');
    expect(callOrder[1]).toBe('execute');
  });

  it('emits done message on success when done callback provided', async () => {
    const inner = { execute: vi.fn(async () => ({ count: 5 })) };
    const ctx = makeContext('tc-1');

    const wrapped = withProgress(inner, {
      start: 'Starting...',
      done: (output) => `Found ${(output as { count: number }).count} results`,
    });
    const result = await wrapped.execute?.('input', ctx);

    expect(result).toEqual({ count: 5 });
    expect(ctx.writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: 'Found 5 results', status: 'done' }),
      }),
    );
  });

  it('does not emit done when no done callback', async () => {
    const inner = { execute: vi.fn(async () => 'result') };
    const ctx = makeContext('tc-1');

    const wrapped = withProgress(inner, { start: 'Starting...' });
    await wrapped.execute?.('input', ctx);

    // Should have been called once for start only
    expect(ctx.writer.custom).toHaveBeenCalledTimes(1);
  });

  it('emits failed status and re-throws on error', async () => {
    const inner = {
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const ctx = makeContext('tc-1');

    const wrapped = withProgress(inner, { start: 'Starting...' });
    await expect(wrapped.execute?.('input', ctx)).rejects.toThrow('boom');

    expect(ctx.writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: 'boom', status: 'failed' }),
      }),
    );
  });

  it('emits generic message for non-Error throws', async () => {
    const inner = {
      execute: vi.fn(async () => {
        throw 'string error';
      }),
    };
    const ctx = makeContext('tc-1');

    const wrapped = withProgress(inner, { start: 'Starting...' });
    await expect(wrapped.execute?.('input', ctx)).rejects.toBe('string error');

    expect(ctx.writer.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: 'Tool execution failed', status: 'failed' }),
      }),
    );
  });

  it('returns tool unchanged when no execute function', () => {
    const inner = { id: 'my-tool', description: 'test' };
    const result = withProgress(inner as never, { start: 'Starting...' });
    expect(result).toBe(inner);
  });

  it('preserves tool properties on wrapped tool', () => {
    const inner = {
      id: 'search-tool',
      description: 'Searches the knowledge base',
      inputSchema: { type: 'object' },
      execute: vi.fn(async () => 'result'),
    };
    const wrapped = withProgress(inner, { start: 'Starting...' });
    expect(wrapped.id).toBe('search-tool');
    expect(wrapped.description).toBe('Searches the knowledge base');
    expect(wrapped.inputSchema).toEqual({ type: 'object' });
    expect(wrapped.execute).not.toBe(inner.execute);
  });
});
