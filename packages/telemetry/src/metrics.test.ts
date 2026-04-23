import { describe, expect, it, vi } from 'vitest';

const mockCreateCounter = vi.fn().mockReturnValue({ add: vi.fn() });
const mockCreateHistogram = vi.fn().mockReturnValue({ record: vi.fn() });
const mockCreateObservableGauge = vi.fn().mockReturnValue({ addCallback: vi.fn() });

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: mockCreateCounter,
      createHistogram: mockCreateHistogram,
      createObservableGauge: mockCreateObservableGauge,
    }),
  },
}));

describe('metrics', () => {
  it('creates conversation counter', async () => {
    const { conversationStarted } = await import('./metrics');

    expect(conversationStarted).toBeDefined();
    expect(mockCreateCounter).toHaveBeenCalledWith('conversation.started', expect.any(Object));
  });
});
