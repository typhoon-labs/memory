import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------

const { MockAgent, agentCtorCalls } = vi.hoisted(() => {
  const agentCtorCalls: Array<Record<string, unknown>> = [];
  class MockAgent {
    // biome-ignore lint/suspicious/noExplicitAny: mock constructor captures all args
    constructor(opts: any) {
      agentCtorCalls.push(opts);
    }
  }
  return { MockAgent, agentCtorCalls };
});

const { mockSearchKnowledge, mockKnowledgeSearchModule } = vi.hoisted(() => {
  const mockSearchKnowledge = { id: 'searchKnowledge' };
  const mockKnowledgeSearchModule = { createKnowledgeSearchTool: vi.fn(() => mockSearchKnowledge) };
  return { mockSearchKnowledge, mockKnowledgeSearchModule };
});

const { mockKnowledgeAgent, mockKnowledgeModule } = vi.hoisted(() => {
  const mockKnowledgeAgent = { id: 'knowledge' };
  const mockKnowledgeModule = { createKnowledgeAgent: vi.fn(() => mockKnowledgeAgent) };
  return { mockKnowledgeAgent, mockKnowledgeModule };
});

const { mockInputProcessors, mockOutputProcessors, mockGuardrailsModule } = vi.hoisted(() => {
  const mockInputProcessors = [{ id: 'input-guardrail' }];
  const mockOutputProcessors = [{ id: 'output-guardrail' }];
  const mockGuardrailsModule = {
    createInputGuardrails: vi.fn(() => mockInputProcessors),
    createOutputGuardrails: vi.fn(() => mockOutputProcessors),
  };
  return { mockInputProcessors, mockOutputProcessors, mockGuardrailsModule };
});

const { mockChatModel, mockGuardrailModel, mockAiModule } = vi.hoisted(() => {
  const mockChatModel = { id: 'chat-model' };
  const mockGuardrailModel = { id: 'guardrail-model' };
  const mockTitleModel = { id: 'title-model' };
  const mockAiModule = {
    createChatModel: vi.fn(() => mockChatModel),
    createGuardrailModel: vi.fn(() => mockGuardrailModel),
    // createTitleModel is called at module-level by set-thread-title.ts
    createTitleModel: vi.fn(() => mockTitleModel),
  };
  return { mockChatModel, mockGuardrailModel, mockAiModule };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@mastra/core/agent', () => ({ Agent: MockAgent }));
vi.mock('./tools/knowledge-search', () => mockKnowledgeSearchModule);
vi.mock('./knowledge', () => mockKnowledgeModule);
vi.mock('./guardrails/input', () => ({ createInputGuardrails: mockGuardrailsModule.createInputGuardrails }));
vi.mock('./guardrails/output', () => ({ createOutputGuardrails: mockGuardrailsModule.createOutputGuardrails }));
vi.mock('@typhoon/ai', () => mockAiModule);
// set-thread-title.ts has module-level side effects that require these mocks
vi.mock('ai', () => ({ generateText: vi.fn(async () => ({ text: '' })) }));
vi.mock('./tools/with-progress', () => ({ emitToolProgress: vi.fn(async () => undefined) }));

import { createSupervisor } from './supervisor';
// Import after mocks are in place
import { setThreadTitle } from './tools/set-thread-title';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSupervisor', () => {
  const fakeMemory = { id: 'fake-memory' } as never;

  beforeEach(() => {
    agentCtorCalls.length = 0;
    vi.clearAllMocks();
    // Restore default mock return values after clearAllMocks resets them
    mockKnowledgeSearchModule.createKnowledgeSearchTool.mockReturnValue(mockSearchKnowledge);
    mockKnowledgeModule.createKnowledgeAgent.mockReturnValue(mockKnowledgeAgent);
    mockGuardrailsModule.createInputGuardrails.mockReturnValue(mockInputProcessors);
    mockGuardrailsModule.createOutputGuardrails.mockReturnValue(mockOutputProcessors);
    mockAiModule.createChatModel.mockReturnValue(mockChatModel);
    mockAiModule.createGuardrailModel.mockReturnValue(mockGuardrailModel);
  });

  it('creates an Agent instance', () => {
    createSupervisor(fakeMemory);
    expect(agentCtorCalls).toHaveLength(1);
  });

  it('constructs the Agent with correct id and name', () => {
    createSupervisor(fakeMemory);
    const opts = agentCtorCalls[0];
    expect(opts?.id).toBe('typhoon-supervisor');
    expect(opts?.name).toBe('Typhoon Supervisor');
  });

  it('includes searchKnowledge and setThreadTitle in tools', () => {
    createSupervisor(fakeMemory);
    const opts = agentCtorCalls[0];
    const tools = opts?.tools as Record<string, unknown>;
    expect(tools).toHaveProperty('searchKnowledge', mockSearchKnowledge);
    expect(tools).toHaveProperty('setThreadTitle', setThreadTitle);
  });

  it('passes memory through to the Agent constructor', () => {
    createSupervisor(fakeMemory);
    const opts = agentCtorCalls[0];
    expect(opts?.memory).toBe(fakeMemory);
  });

  it('sets temperature to 0 via defaultOptions', () => {
    createSupervisor(fakeMemory);
    const opts = agentCtorCalls[0] as { defaultOptions?: { modelSettings?: { temperature?: number } } };
    expect(opts?.defaultOptions?.modelSettings?.temperature).toBe(0);
  });

  it('sets inputProcessors and outputProcessors when guardrails are enabled', () => {
    createSupervisor(fakeMemory, { promptInjection: true, moderation: true });
    const opts = agentCtorCalls[0] as {
      inputProcessors?: unknown;
      outputProcessors?: unknown;
    };
    expect(opts?.inputProcessors).toBe(mockInputProcessors);
    expect(opts?.outputProcessors).toBe(mockOutputProcessors);
  });

  it('passes guardrails config to createInputGuardrails and createOutputGuardrails', () => {
    const config = { promptInjection: false, moderation: true };
    createSupervisor(fakeMemory, config);
    expect(mockGuardrailsModule.createInputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, config);
    expect(mockGuardrailsModule.createOutputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, config);
  });

  it('still calls guardrail factories when no guardrails config is provided', () => {
    createSupervisor(fakeMemory);
    expect(mockGuardrailsModule.createInputGuardrails).toHaveBeenCalled();
    expect(mockGuardrailsModule.createOutputGuardrails).toHaveBeenCalled();
  });

  it('creates the knowledge agent and passes it to the search tool factory', () => {
    createSupervisor(fakeMemory);
    expect(mockKnowledgeModule.createKnowledgeAgent).toHaveBeenCalledWith({ rerank: false });
    expect(mockKnowledgeSearchModule.createKnowledgeSearchTool).toHaveBeenCalledWith(mockKnowledgeAgent, {
      getMetadataContext: undefined,
    });
  });

  it('accepts GuardrailsConfig directly as second parameter for backward compatibility', () => {
    const guardrails = { promptInjection: true, moderation: false };
    createSupervisor(fakeMemory, guardrails);
    expect(mockGuardrailsModule.createInputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, guardrails);
    expect(mockGuardrailsModule.createOutputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, guardrails);
    expect(mockKnowledgeModule.createKnowledgeAgent).toHaveBeenCalledWith({ rerank: false });
  });

  it('passes getMetadataContext to createKnowledgeSearchTool', () => {
    const getMetadataContext = async () => 'field: val1, val2';
    createSupervisor(fakeMemory, { getMetadataContext });
    expect(mockKnowledgeSearchModule.createKnowledgeSearchTool).toHaveBeenCalledWith(mockKnowledgeAgent, {
      getMetadataContext,
    });
  });

  it('accepts SupervisorOptions with both guardrails and getMetadataContext', () => {
    const getMetadataContext = async () => 'field: val1';
    const opts = {
      guardrails: { promptInjection: true, moderation: true },
      getMetadataContext,
    };
    createSupervisor(fakeMemory, opts);
    expect(mockKnowledgeModule.createKnowledgeAgent).toHaveBeenCalledWith({ rerank: false });
    expect(mockGuardrailsModule.createInputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, opts.guardrails);
    expect(mockGuardrailsModule.createOutputGuardrails).toHaveBeenCalledWith(mockGuardrailModel, opts.guardrails);
  });
});
