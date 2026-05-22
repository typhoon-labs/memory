import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { ScorePanel } from './score-panel';
import type { ReviewScore } from './shared';

const mockApiFetch = vi.mocked(apiFetch);

function makeScore(overrides: Partial<ReviewScore> = {}): ReviewScore {
  return {
    id: 'sc-1',
    scorer_id: 'answerRelevancy',
    score: 0.85,
    reason: 'Good relevancy',
    metadata: null,
    resource_id: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('ScorePanel', () => {
  it('shows "Scoring in progress" for recent message with no scores', () => {
    // Message created less than 60s ago
    const recentDate = new Date(Date.now() - 10_000).toISOString();
    renderWithQueryClient(<ScorePanel scores={[]} messageCreatedAt={recentDate} />);
    expect(screen.getByText('Scoring in progress...')).toBeTruthy();
  });

  it('shows "No scores available" for old message with no scores', () => {
    const oldDate = new Date(Date.now() - 120_000).toISOString();
    renderWithQueryClient(<ScorePanel scores={[]} messageCreatedAt={oldDate} />);
    expect(screen.getByText('No scores available for this message.')).toBeTruthy();
  });

  it('excludes human-review scores from automated list', () => {
    const oldDate = new Date(Date.now() - 120_000).toISOString();
    const humanScore = makeScore({
      id: 'hr-1',
      scorer_id: 'human-review',
      score: null,
      reason: '',
    });
    renderWithQueryClient(<ScorePanel scores={[humanScore]} messageCreatedAt={oldDate} />);
    // Only human-review scores, so no automated scores to display
    expect(screen.getByText('No scores available for this message.')).toBeTruthy();
  });

  it('renders response quality scores with formatted labels', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [
      makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.85, reason: 'Good relevancy' }),
      makeScore({ id: 'sc-2', scorer_id: 'faithfulness', score: 0.92, reason: 'Faithful' }),
    ];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Response Quality')).toBeTruthy();
      expect(screen.getByText('Answer Relevancy')).toBeTruthy();
      expect(screen.getByText('Faithfulness')).toBeTruthy();
      expect(screen.getByText('0.85')).toBeTruthy();
      expect(screen.getByText('0.92')).toBeTruthy();
    });
  });

  it('renders retrieval quality section', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [
      makeScore({ id: 'sc-1', scorer_id: 'contextRelevance', score: 0.7 }),
      makeScore({ id: 'sc-2', scorer_id: 'contextPrecision', score: 0.65 }),
    ];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Retrieval Quality')).toBeTruthy();
      expect(screen.getByText('Context Relevance')).toBeTruthy();
      expect(screen.getByText('Context Precision')).toBeTruthy();
    });
  });

  it('shows N/A when retrieval scorers expected but no retrieval scores present', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.85 })];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Retrieval Quality')).toBeTruthy();
      expect(screen.getByText('N/A')).toBeTruthy();
      expect(screen.getByText('No retrieval context')).toBeTruthy();
    });
  });

  it('renders custom/other scorers in Other section', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [makeScore({ id: 'sc-1', scorer_id: 'myCustomScorer', score: 0.5, reason: 'Custom reason' })];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Other')).toBeTruthy();
      // camelCase is split: "myCustomScorer" -> "my Custom Scorer"
      expect(screen.getByText('My Custom Scorer')).toBeTruthy();
      expect(screen.getByText('0.50')).toBeTruthy();
    });
  });

  it('shows dash for null score', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: null })];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      // \u2014 is em-dash
      expect(screen.getByText('\u2014')).toBeTruthy();
    });
  });

  it('displays reasoning for active/default scorer', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [
      makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.3, reason: 'Low relevancy explanation' }),
    ];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Low relevancy explanation')).toBeTruthy();
    });
  });

  it('shows "No reasoning provided" when active scorer has no reason', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.85, reason: '' })];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('No reasoning provided for this scorer.')).toBeTruthy();
    });
  });

  it('renders category averages', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [] });
    const scores = [
      makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.8 }),
      makeScore({ id: 'sc-2', scorer_id: 'faithfulness', score: 0.9 }),
    ];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      // Average of 0.80 and 0.90 = 0.85
      expect(screen.getByText('0.85')).toBeTruthy();
    });
  });

  it('displays scorer descriptions from API as tooltips', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [{ name: 'answerRelevancy', description: 'Measures answer relevance' }],
    });
    const scores = [makeScore({ id: 'sc-1', scorer_id: 'answerRelevancy', score: 0.85 })];
    renderWithQueryClient(<ScorePanel scores={scores} messageCreatedAt="2025-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(screen.getByText('Answer Relevancy')).toBeTruthy();
    });
  });
});
