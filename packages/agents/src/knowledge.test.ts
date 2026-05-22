import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------

const { MockAgent, agentCtorCalls } = vi.hoisted(() => {
  const agentCtorCalls: Array<Record<string, unknown>> = [];
  class MockAgent {
    constructor(opts: any) {
      agentCtorCalls.push(opts);
    }
  }
  return { MockAgent, agentCtorCalls };
});

const { mockHybridTool, mockGraphTool } = vi.hoisted(() => {
  const mockHybridTool = { id: 'search_knowledge_base_hybrid' };
  const mockGraphTool = { id: 'search_knowledge_base_graph' };
  return { mockHybridTool, mockGraphTool };
});

const { mockKnowledgeModel, mockAiModule } = vi.hoisted(() => {
  const mockKnowledgeModel = { id: 'knowledge-model' };
  const mockAiModule = { createKnowledgeModel: vi.fn(() => mockKnowledgeModel) };
  return { mockKnowledgeModel, mockAiModule };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@mastra/core/agent', () => ({ Agent: MockAgent }));
vi.mock('./tools/search-kb-hybrid', () => ({
  searchKnowledgeBaseHybrid: mockHybridTool,
  createHybridSearchTool: vi.fn().mockReturnValue(mockHybridTool),
}));
vi.mock('./tools/graph-kb', () => ({ searchKnowledgeBaseGraph: mockGraphTool }));
vi.mock('@typhoon/ai', () => mockAiModule);

// Import after mocks
import { createKnowledgeAgent } from './knowledge';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createKnowledgeAgent', () => {
  const fakeMemory = { id: 'fake-memory' } as never;

  beforeEach(() => {
    agentCtorCalls.length = 0;
    vi.clearAllMocks();
    mockAiModule.createKnowledgeModel.mockReturnValue(mockKnowledgeModel);
  });

  it('creates an Agent instance', () => {
    createKnowledgeAgent();
    expect(agentCtorCalls).toHaveLength(1);
  });

  it('constructs the Agent with correct id and name', () => {
    createKnowledgeAgent();
    const opts = agentCtorCalls[0];
    expect(opts?.id).toBe('knowledge');
    expect(opts?.name).toBe('Knowledge Agent');
  });

  it('includes searchKnowledgeBaseHybrid in tools', () => {
    createKnowledgeAgent();
    const tools = agentCtorCalls[0]?.tools as Record<string, unknown>;
    expect(tools).toHaveProperty('searchKnowledgeBaseHybrid', mockHybridTool);
  });

  it('includes searchKnowledgeBaseGraph in tools', () => {
    createKnowledgeAgent();
    const tools = agentCtorCalls[0]?.tools as Record<string, unknown>;
    expect(tools).toHaveProperty('searchKnowledgeBaseGraph', mockGraphTool);
  });

  it('sets toolChoice to "required"', () => {
    createKnowledgeAgent();
    const opts = agentCtorCalls[0] as { defaultOptions?: { toolChoice?: string } };
    expect(opts?.defaultOptions?.toolChoice).toBe('required');
  });

  it('sets temperature to 0', () => {
    createKnowledgeAgent();
    const opts = agentCtorCalls[0] as { defaultOptions?: { modelSettings?: { temperature?: number } } };
    expect(opts?.defaultOptions?.modelSettings?.temperature).toBe(0);
  });

  it('passes memory through to Agent constructor when provided', () => {
    createKnowledgeAgent({ memory: fakeMemory });
    expect(agentCtorCalls[0]?.memory).toBe(fakeMemory);
  });

  it('passes undefined memory when not provided', () => {
    createKnowledgeAgent();
    expect(agentCtorCalls[0]?.memory).toBeUndefined();
  });

  it('uses the model from createKnowledgeModel', () => {
    createKnowledgeAgent();
    expect(mockAiModule.createKnowledgeModel).toHaveBeenCalled();
    expect(agentCtorCalls[0]?.model).toBe(mockKnowledgeModel);
  });

  it('includes default value fallback guidance in instructions', () => {
    createKnowledgeAgent();
    const instructions = agentCtorCalls[0]?.instructions as string;
    expect(instructions).toContain('default value');
    expect(instructions).toContain('$in filter');
  });
});
