import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/processors', () => {
  class MockTokenLimiterProcessor {
    id = 'token-limiter';
    name = 'TokenLimiterProcessor';
    constructor(public opts?: any) {}
  }
  class MockPromptInjectionDetector {
    id = 'prompt-injection-detector';
    name = 'PromptInjectionDetector';
  }
  class MockModerationProcessor {
    id = 'moderation-processor';
    name = 'ModerationProcessor';
  }
  class MockPIIDetector {
    id = 'processor:pii-detector';
    name = 'PIIDetector';
  }
  return {
    TokenLimiterProcessor: MockTokenLimiterProcessor,
    PromptInjectionDetector: MockPromptInjectionDetector,
    ModerationProcessor: MockModerationProcessor,
    PIIDetector: MockPIIDetector,
    ProcessorStepSchema: {},
  };
});

const { mockWorkflow, mockCreateWorkflow } = vi.hoisted(() => {
  const mockWorkflow = {
    // oxlint-disable-next-line unicorn/no-thenable -- mocking Mastra workflow API
    then: vi.fn(),
    parallel: vi.fn(),
    map: vi.fn(),
    commit: vi.fn(),
  };
  mockWorkflow.then.mockReturnValue(mockWorkflow);
  mockWorkflow.parallel.mockReturnValue(mockWorkflow);
  mockWorkflow.map.mockReturnValue(mockWorkflow);
  mockWorkflow.commit.mockReturnValue(mockWorkflow);

  return { mockWorkflow, mockCreateWorkflow: vi.fn(() => mockWorkflow) };
});

vi.mock('@mastra/core/workflows', () => ({
  createStep: vi.fn((p) => p),
  createWorkflow: mockCreateWorkflow,
}));

import { createInputGuardrails, type InputGuardrailsConfig } from './input';

describe('createInputGuardrails', () => {
  const fakeModel = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflow.then.mockReturnValue(mockWorkflow);
    mockWorkflow.parallel.mockReturnValue(mockWorkflow);
    mockWorkflow.map.mockReturnValue(mockWorkflow);
    mockWorkflow.commit.mockReturnValue(mockWorkflow);
  });

  it('returns only TokenLimiterProcessor when all checks disabled', () => {
    const config: InputGuardrailsConfig = {
      promptInjection: false,
      moderation: false,
      piiDetection: false,
    };
    const result = createInputGuardrails(fakeModel, config);
    expect(result).toHaveLength(1);
    expect((result[0] as unknown as Record<string, unknown>).id).toBe('token-limiter');
    // No workflow created when all disabled
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
  });

  it('creates sequential workflow for single processor', () => {
    const result = createInputGuardrails(fakeModel, {
      promptInjection: true,
      moderation: false,
      piiDetection: false,
    });
    expect(result).toHaveLength(1);
    expect(mockCreateWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'input-guardrails' }));
    // Sequential: .then(limiter).then(processor) — called twice
    expect(mockWorkflow.then).toHaveBeenCalledTimes(2);
    expect(mockWorkflow.parallel).not.toHaveBeenCalled();
  });

  it('creates parallel workflow for multiple processors', () => {
    createInputGuardrails(fakeModel, {
      promptInjection: true,
      moderation: true,
      piiDetection: false,
    });
    expect(mockCreateWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'input-guardrails' }));
    // Parallel: .then(limiter).parallel(steps).map(...)
    expect(mockWorkflow.then).toHaveBeenCalledTimes(1);
    expect(mockWorkflow.parallel).toHaveBeenCalledTimes(1);
    expect(mockWorkflow.map).toHaveBeenCalledTimes(1);
  });

  it('creates parallel workflow with all 3 processors by default', () => {
    createInputGuardrails(fakeModel);
    expect(mockWorkflow.parallel).toHaveBeenCalledTimes(1);
    // parallel receives array of 3 steps
    const parallelArgs = mockWorkflow.parallel.mock.calls[0][0];
    expect(parallelArgs).toHaveLength(3);
  });

  it('merges partial config with defaults', () => {
    createInputGuardrails(fakeModel, { moderation: false });
    // promptInjection + piiDetection = 2 steps → parallel
    expect(mockWorkflow.parallel).toHaveBeenCalledTimes(1);
    const parallelArgs = mockWorkflow.parallel.mock.calls[0][0];
    expect(parallelArgs).toHaveLength(2);
  });
});
