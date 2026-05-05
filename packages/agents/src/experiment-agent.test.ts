import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { mockChatModel, mockAiModule } = vi.hoisted(() => {
  const mockChatModel = { id: 'chat-model' };
  const mockAiModule = { createChatModel: vi.fn(() => mockChatModel) };
  return { mockChatModel, mockAiModule };
});

vi.mock('@mastra/core/agent', () => ({ Agent: MockAgent }));
vi.mock('./tools/knowledge-search', () => mockKnowledgeSearchModule);
vi.mock('./knowledge', () => mockKnowledgeModule);
vi.mock('@typhoon/ai', () => mockAiModule);

import { createExperimentAgent } from './experiment-agent';

describe('createExperimentAgent', () => {
  beforeEach(() => {
    agentCtorCalls.length = 0;
    vi.clearAllMocks();
  });

  it('creates an Agent instance', () => {
    const agent = createExperimentAgent();
    expect(agent).toBeInstanceOf(MockAgent);
    expect(agentCtorCalls).toHaveLength(1);
  });

  it('sets id to "typhoon-experiment"', () => {
    createExperimentAgent();
    expect(agentCtorCalls[0].id).toBe('typhoon-experiment');
  });

  it('sets name to "Typhoon Experiment Agent"', () => {
    createExperimentAgent();
    expect(agentCtorCalls[0].name).toBe('Typhoon Experiment Agent');
  });

  it('uses the chat model from @typhoon/ai', () => {
    createExperimentAgent();
    expect(mockAiModule.createChatModel).toHaveBeenCalled();
    expect(agentCtorCalls[0].model).toBe(mockChatModel);
  });

  it('includes searchKnowledge tool', () => {
    createExperimentAgent();
    const tools = agentCtorCalls[0].tools as Record<string, unknown>;
    expect(tools.searchKnowledge).toBe(mockSearchKnowledge);
  });

  it('creates knowledge agent and passes it to search tool factory', () => {
    createExperimentAgent();
    expect(mockKnowledgeModule.createKnowledgeAgent).toHaveBeenCalled();
    expect(mockKnowledgeSearchModule.createKnowledgeSearchTool).toHaveBeenCalledWith(mockKnowledgeAgent);
  });

  it('sets temperature to 0', () => {
    createExperimentAgent();
    const opts = agentCtorCalls[0].defaultOptions as { modelSettings: { temperature: number } };
    expect(opts.modelSettings.temperature).toBe(0);
  });

  it('does not include memory', () => {
    createExperimentAgent();
    expect(agentCtorCalls[0].memory).toBeUndefined();
  });

  it('does not include input or output processors (no guardrails)', () => {
    createExperimentAgent();
    expect(agentCtorCalls[0].inputProcessors).toBeUndefined();
    expect(agentCtorCalls[0].outputProcessors).toBeUndefined();
  });
});
