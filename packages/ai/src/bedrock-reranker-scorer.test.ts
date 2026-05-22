import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  return {
    BedrockAgentRuntimeClient: class MockClient {
      send = mockSend;
    },
    RerankCommand: class MockRerankCommand {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
  };
});

vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: vi.fn(() => ({})),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@typhoon/telemetry', () => ({
  rerankRetryCount: { add: vi.fn() },
  rerankSearchUnits: { add: vi.fn() },
}));

import { BedrockRerankerScorer } from './bedrock-reranker-scorer';

describe('BedrockRerankerScorer', () => {
  const modelArn = 'arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns relevance scores from Bedrock rerank response', async () => {
    mockSend.mockResolvedValueOnce({
      results: [
        { index: 0, relevanceScore: 0.95 },
        { index: 1, relevanceScore: 0.3 },
      ],
      $metadata: { requestId: 'req-123' },
    });

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 0);
    const [score1, score2] = await Promise.all([
      scorer.getRelevanceScore('What is AI?', 'AI is artificial intelligence'),
      scorer.getRelevanceScore('What is AI?', 'S3 is object storage'),
    ]);

    expect(score1).toBe(0.95);
    expect(score2).toBe(0.3);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('batches concurrent requests with the same query into one API call', async () => {
    mockSend.mockResolvedValueOnce({
      results: [
        { index: 0, relevanceScore: 0.9 },
        { index: 1, relevanceScore: 0.5 },
        { index: 2, relevanceScore: 0.1 },
      ],
      $metadata: {},
    });

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 0);
    const scores = await Promise.all([
      scorer.getRelevanceScore('query', 'doc1'),
      scorer.getRelevanceScore('query', 'doc2'),
      scorer.getRelevanceScore('query', 'doc3'),
    ]);

    expect(scores).toEqual([0.9, 0.5, 0.1]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('handles missing results by resolving to 0', async () => {
    mockSend.mockResolvedValueOnce({
      results: [{ index: 0, relevanceScore: 0.8 }],
      $metadata: {},
    });

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 0);
    const [score1, score2] = await Promise.all([
      scorer.getRelevanceScore('query', 'doc1'),
      scorer.getRelevanceScore('query', 'doc2'),
    ]);

    expect(score1).toBe(0.8);
    expect(score2).toBe(0);
  });

  it('rejects all requests on non-retryable error', async () => {
    const error = new Error('Access denied');
    error.name = 'AccessDeniedException';
    mockSend.mockRejectedValueOnce(error);

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 0);
    await expect(scorer.getRelevanceScore('query', 'doc')).rejects.toThrow('Access denied');
  });

  it('retries on throttling errors', async () => {
    const throttle = new Error('Rate exceeded');
    throttle.name = 'ThrottlingException';
    mockSend.mockRejectedValueOnce(throttle).mockResolvedValueOnce({
      results: [{ index: 0, relevanceScore: 0.7 }],
      $metadata: {},
    });

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 1, 10, 100);
    const score = await scorer.getRelevanceScore('query', 'doc');
    expect(score).toBe(0.7);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('captures metrics for the query', async () => {
    mockSend.mockResolvedValueOnce({
      results: [{ index: 0, relevanceScore: 0.85 }],
      $metadata: {},
    });

    const scorer = new BedrockRerankerScorer(modelArn, 'us-east-1', 0);
    await scorer.getRelevanceScore('test query', 'doc');

    const metrics = scorer.getMetrics('test query');
    expect(metrics).not.toBeNull();
    expect(metrics!.model).toBe(modelArn);
    expect(metrics!.documentCount).toBe(1);
    expect(metrics!.resultCount).toBe(1);
    expect(metrics!.topScore).toBe(0.85);
    expect(metrics!.durationMs).toBeGreaterThanOrEqual(0);

    // Metrics consumed — second call returns null
    expect(scorer.getMetrics('test query')).toBeNull();
  });
});
