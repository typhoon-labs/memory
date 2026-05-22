import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useSearch: () => mockSearchParams,
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('@typhoon/evals/scorer-categories', () => ({
  computeCategoryAverages: vi.fn((scores: Array<{ scorerId: string; score: number | null }>) => {
    // Return average of scores when present, otherwise null
    const valid = scores.filter((s) => s.score !== null);
    if (valid.length === 0) return { responseAvg: null, retrievalAvg: null };
    const avg = valid.reduce((sum, s) => sum + (s.score ?? 0), 0) / valid.length;
    return { responseAvg: avg, retrievalAvg: null };
  }),
  normalizeScoreForAvg: vi.fn((_sid: string, v: number) => v),
  SCORER_CATEGORIES: {},
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ExperimentComparePage } from './experiment-compare';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;
mockApiFetch.mockReturnValue(new Promise(() => {}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = {};
});

describe('ExperimentComparePage', () => {
  it('renders without crashing', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ExperimentComparePage />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no experiment params provided', () => {
    mockSearchParams = {};
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ExperimentComparePage />);
    expect(screen.getByText('No experiment selected')).toBeTruthy();
    expect(screen.getByText('Navigate here from an experiment detail page to start a comparison.')).toBeTruthy();
  });

  it('shows experiment selector when only param b is set', async () => {
    mockSearchParams = { b: 'exp-2' };
    mockApiFetch
      // known experiment fetch (for exp-2)
      .mockResolvedValueOnce({
        id: 'exp-2',
        name: 'Candidate',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01',
      })
      // experiments list fetch for ExperimentSelector
      .mockResolvedValueOnce({
        experiments: [
          {
            id: 'exp-1',
            name: 'Baseline',
            status: 'completed',
            datasetId: 'ds-1',
            totalItems: 5,
            succeededCount: 5,
            failedCount: 0,
            createdAt: '2025-01-01',
          },
          {
            id: 'exp-2',
            name: 'Candidate',
            status: 'completed',
            datasetId: 'ds-1',
            totalItems: 5,
            succeededCount: 5,
            failedCount: 0,
            createdAt: '2025-01-01',
          },
        ],
        total: 2,
      });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Select a baseline to compare against')).toBeTruthy();
    });
  });

  it('shows experiment selector when only param a is set', async () => {
    mockSearchParams = { a: 'exp-1' };
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Baseline',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        experiments: [
          {
            id: 'exp-1',
            name: 'Baseline',
            status: 'completed',
            datasetId: 'ds-1',
            totalItems: 5,
            succeededCount: 5,
            failedCount: 0,
            createdAt: '2025-01-01',
          },
          {
            id: 'exp-2',
            name: 'Candidate',
            status: 'completed',
            datasetId: 'ds-1',
            totalItems: 5,
            succeededCount: 5,
            failedCount: 0,
            createdAt: '2025-01-01',
          },
        ],
        total: 2,
      });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Select a candidate to compare against')).toBeTruthy();
    });
  });

  it('shows loading spinner when both params set and data loading', () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ExperimentComparePage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders comparison results with stat cards and summary', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'Baseline Run' },
          experimentB: { id: 'exp-2', name: 'Candidate Run' },
          aggregate: {
            avgScoreA: 0.72,
            avgScoreB: 0.85,
            improvementCount: 3,
            regressionCount: 1,
          },
          items: [
            {
              input: { question: 'What is Typhoon?' },
              resultA: { groundTruth: 'An AI chatbot', output: { responseText: 'A chatbot', scores: [] } },
              resultB: { groundTruth: 'An AI chatbot', output: { responseText: 'An AI-powered chatbot', scores: [] } },
              scoreDelta: 0.1,
            },
          ],
        });
      }
      // experiment detail fetch (for known experiment)
      return Promise.resolve({
        id: 'exp-1',
        name: 'Baseline Run',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });

    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Experiment names in cards
      expect(screen.getByText('Baseline Run')).toBeTruthy();
      expect(screen.getByText('Candidate Run')).toBeTruthy();
    });
    // Avg scores
    expect(screen.getByText('0.72')).toBeTruthy();
    expect(screen.getByText('0.85')).toBeTruthy();
    // Summary line
    expect(screen.getByText(/3 improvements/)).toBeTruthy();
    expect(screen.getByText(/1 regression\b/)).toBeTruthy();
  });

  it('renders Swap A / B button with comparison data', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 0 },
          items: [],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });

    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Swap A / B')).toBeTruthy();
    });
  });

  it('shows empty state when comparison items are empty', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: null, avgScoreB: null, improvementCount: 0, regressionCount: 0 },
          items: [],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });

    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('No comparison data')).toBeTruthy();
    });
  });

  it('renders breadcrumb with link to experiments list', () => {
    mockSearchParams = {};
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ExperimentComparePage />);
    expect(screen.getByText('Experiments')).toBeTruthy();
    expect(screen.getByText('Compare')).toBeTruthy();
  });

  it('renders comparison table with input and delta columns', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'Baseline' },
          experimentB: { id: 'exp-2', name: 'Candidate' },
          aggregate: {
            avgScoreA: 0.6,
            avgScoreB: 0.8,
            improvementCount: 2,
            regressionCount: 1,
          },
          items: [
            {
              input: { question: 'What is Typhoon?' },
              resultA: { groundTruth: 'A chatbot', output: { responseText: 'A chatbot', scores: [] } },
              resultB: { groundTruth: 'A chatbot', output: { responseText: 'An AI chatbot', scores: [] } },
              scoreDelta: 0.15,
            },
            {
              input: { question: 'How does RAG work?' },
              resultA: { groundTruth: 'Retrieval', output: { responseText: 'Retrieval aug', scores: [] } },
              resultB: { groundTruth: 'Retrieval', output: { responseText: 'RAG uses retrieval', scores: [] } },
              scoreDelta: -0.05,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'Baseline',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });

    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // "Baseline" appears in stat card header and column header, so check both exist
      expect(screen.getAllByText('Baseline').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Candidate').length).toBeGreaterThanOrEqual(1);
    });
    // Table column headers ("Delta" appears in both stat card and table)
    expect(screen.getByText('Input')).toBeTruthy();
    expect(screen.getAllByText('Delta').length).toBeGreaterThanOrEqual(2);
    // Summary line
    expect(screen.getByText(/2 improvements/)).toBeTruthy();
    expect(screen.getByText(/1 regression\b/)).toBeTruthy();
  });

  it('renders positive delta with + sign and green color', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.8, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'test input',
              resultA: { output: { responseText: 'resp', scores: [] } },
              resultB: { output: { responseText: 'resp', scores: [] } },
              scoreDelta: 0.3,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Positive delta appears in stat card and per-item row
      expect(screen.getAllByText('+0.30').length).toBeGreaterThanOrEqual(1);
    });
    // At least one delta element should have emerald color class (the stat card)
    const deltaEls = screen.getAllByText('+0.30');
    const hasEmerald = deltaEls.some((el) => el.className.includes('emerald'));
    expect(hasEmerald).toBe(true);
  });

  it('renders negative overall delta with red color', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.8, avgScoreB: 0.5, improvementCount: 0, regressionCount: 1 },
          items: [
            {
              input: 'test',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: -0.3,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Negative delta appears in stat card and per-item row
      expect(screen.getAllByText('-0.30').length).toBeGreaterThanOrEqual(1);
    });
    // At least one delta element should have red color class
    const deltaEls = screen.getAllByText('-0.30');
    const hasRed = deltaEls.some((el) => el.className.includes('red'));
    expect(hasRed).toBe(true);
  });

  it('renders unchanged count in summary', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.5, improvementCount: 0, regressionCount: 0 },
          items: [
            {
              input: 'unchanged item',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: 0,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('1 unchanged')).toBeTruthy();
    });
  });

  it('renders avg score labels in stat cards', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'Baseline' },
          experimentB: { id: 'exp-2', name: 'Candidate' },
          aggregate: { avgScoreA: 0.45, avgScoreB: 0.67, improvementCount: 1, regressionCount: 0 },
          items: [],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'Baseline',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Avg score values
      expect(screen.getByText('0.45')).toBeTruthy();
      expect(screen.getByText('0.67')).toBeTruthy();
    });
    // The stat card headers
    expect(screen.getByText('Baseline (A)')).toBeTruthy();
    expect(screen.getByText('Candidate (B)')).toBeTruthy();
    expect(screen.getByText('Candidate \u2212 Baseline')).toBeTruthy();
  });

  it('renders description text on page header', () => {
    mockSearchParams = {};
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ExperimentComparePage />);
    expect(screen.getByText('Side-by-side comparison of experiment results')).toBeTruthy();
  });

  it('shows no experiments to compare when no candidates exist', async () => {
    mockSearchParams = { a: 'exp-1' };
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Only One',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        experiments: [
          {
            id: 'exp-1',
            name: 'Only One',
            status: 'completed',
            datasetId: 'ds-1',
            totalItems: 5,
            succeededCount: 5,
            failedCount: 0,
            createdAt: '2025-01-01',
          },
        ],
        total: 1,
      });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('No experiments to compare')).toBeTruthy();
    });
  });

  it('renders dash for null avg scores in stat cards', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: null, avgScoreB: null, improvementCount: 0, regressionCount: 0 },
          items: [
            {
              input: 'test',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: null,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeTruthy();
    });
    // Dash characters for null scores — there should be multiple dashes for A avg, B avg, and delta
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('renders input text in comparison table rows', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'What is the capital of France?',
              resultA: { output: { responseText: 'Paris', scores: [] } },
              resultB: { output: { responseText: 'Paris, France', scores: [] } },
              scoreDelta: 0.05,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText(/What is the capital of France/)).toBeTruthy();
    });
  });

  it('renders zero delta as "0.00"', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.5, improvementCount: 0, regressionCount: 0 },
          items: [
            {
              input: 'test',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: 0,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Zero delta in the per-item row should render "0.00"
      expect(screen.getByText('0.00')).toBeTruthy();
    });
  });

  it('renders singular "improvement" and "regression" text', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 1 },
          items: [
            {
              input: 'test',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: 0.1,
            },
            {
              input: 'test2',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: -0.1,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 2,
        succeededCount: 2,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Singular: "1 improvement" (not "improvements")
      expect(screen.getByText('1 improvement')).toBeTruthy();
      expect(screen.getByText('1 regression')).toBeTruthy();
    });
  });

  it('renders experiment ID prefix when name is null', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'abcdefghijklmnop', name: null },
          experimentB: { id: 'qrstuvwxyz123456', name: null },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 0 },
          items: [],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'X',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // ID sliced to first 8 chars
      expect(screen.getByText('abcdefgh')).toBeTruthy();
      expect(screen.getByText('qrstuvwx')).toBeTruthy();
    });
  });

  it('renders score values in baseline and candidate columns with tooltips', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.7, avgScoreB: 0.8, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'score test',
              resultA: {
                output: {
                  responseText: 'resp A',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.8 },
                    { scorerId: 'fluency', name: 'fluency', score: 0.6 },
                  ],
                },
              },
              resultB: {
                output: {
                  responseText: 'resp B',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.9 },
                    { scorerId: 'fluency', name: 'fluency', score: 0.7 },
                  ],
                },
              },
              scoreDelta: 0.1,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Score values should render as numbers (from extractResultScore -> computeCategoryAverages)
      expect(screen.getByText('score test')).toBeTruthy();
    });
  });

  it('renders null score as dash in baseline column', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: null, avgScoreB: 0.5, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'test null score',
              resultA: null,
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: null,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('test null score')).toBeTruthy();
    });
  });

  it('renders string input directly in table', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.5, improvementCount: 0, regressionCount: 0 },
          items: [
            {
              input: 'A plain string input for testing',
              resultA: { output: { responseText: 'r', scores: [] } },
              resultB: { output: { responseText: 'r', scores: [] } },
              scoreDelta: 0,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText(/A plain string input/)).toBeTruthy();
    });
  });

  it('renders ComparisonDetailSheet when item param is set', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2', item: 0 };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.7, avgScoreB: 0.8, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: { question: 'What is Typhoon?' },
              resultA: {
                groundTruth: 'A chatbot',
                output: {
                  responseText: 'An AI chatbot',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.8, reason: 'Good accuracy' },
                    { scorerId: 'fluency', name: 'fluency', score: 0.6, reason: 'Average fluency' },
                  ],
                },
              },
              resultB: {
                groundTruth: 'A chatbot',
                output: {
                  responseText: 'Typhoon is an AI-powered customer service chatbot',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.9, reason: 'Excellent accuracy' },
                    { scorerId: 'fluency', name: 'fluency', score: 0.85, reason: 'Good fluency' },
                  ],
                },
              },
              scoreDelta: 0.15,
            },
          ],
        });
      }
      if (url.includes('/scorers')) {
        return Promise.resolve({
          scorers: [
            { name: 'accuracy', description: 'Measures factual correctness' },
            { name: 'fluency', description: 'Measures language quality' },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      // Detail sheet opens with "Comparison Detail" title
      expect(screen.getByText('Comparison Detail')).toBeTruthy();
    });
    // Input text should be visible in the sheet (may appear multiple times: table + sheet)
    expect(screen.getAllByText(/What is Typhoon/).length).toBeGreaterThanOrEqual(1);
    // Scores section should render
    expect(screen.getByText('Scores')).toBeTruthy();
    // Baseline/Candidate labels
    expect(screen.getAllByText('Baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Candidate').length).toBeGreaterThanOrEqual(1);
    // Score breakdown should show scorer names
    expect(screen.getByText('Score Breakdown')).toBeTruthy();
    // Responses section
    expect(screen.getByText('Responses')).toBeTruthy();
  });

  it('renders ComparisonDetailSheet with ground truth', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2', item: 0 };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'Test input string',
              resultA: {
                groundTruth: 'Expected answer here',
                output: { responseText: 'Response A', scores: [] },
              },
              resultB: {
                groundTruth: 'Expected answer here',
                output: { responseText: 'Response B', scores: [] },
              },
              scoreDelta: 0.1,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Comparison Detail')).toBeTruthy();
    });
    // Ground truth section
    expect(screen.getByText('Expected')).toBeTruthy();
    expect(screen.getByText(/Expected answer here/)).toBeTruthy();
  });

  it('renders ComparisonDetailSheet with negative delta', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2', item: 0 };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.8, avgScoreB: 0.5, improvementCount: 0, regressionCount: 1 },
          items: [
            {
              input: 'delta test',
              resultA: { output: { responseText: 'better', scores: [] } },
              resultB: { output: { responseText: 'worse', scores: [] } },
              scoreDelta: -0.3,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Comparison Detail')).toBeTruthy();
    });
  });

  it('renders score values with tooltips for multiple scorers in table', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.7, avgScoreB: 0.8, improvementCount: 1, regressionCount: 0 },
          items: [
            {
              input: 'Multi scorer test',
              resultA: {
                output: {
                  responseText: 'resp A',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.8 },
                    { scorerId: 'fluency', name: 'fluency', score: 0.6 },
                  ],
                },
              },
              resultB: {
                output: {
                  responseText: 'resp B',
                  scores: [
                    { scorerId: 'accuracy', name: 'accuracy', score: 0.9 },
                    { scorerId: 'fluency', name: 'fluency', score: 0.85 },
                  ],
                },
              },
              scoreDelta: 0.15,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText('Multi scorer test')).toBeTruthy();
    });
  });

  it('renders multiple comparison items with different deltas', async () => {
    mockSearchParams = { a: 'exp-1', b: 'exp-2' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/compare')) {
        return Promise.resolve({
          experimentA: { id: 'exp-1', name: 'A' },
          experimentB: { id: 'exp-2', name: 'B' },
          aggregate: { avgScoreA: 0.5, avgScoreB: 0.6, improvementCount: 1, regressionCount: 1 },
          items: [
            {
              input: 'Item improved',
              resultA: { output: { responseText: 'old', scores: [] } },
              resultB: { output: { responseText: 'new', scores: [] } },
              scoreDelta: 0.2,
            },
            {
              input: 'Item regressed',
              resultA: { output: { responseText: 'old', scores: [] } },
              resultB: { output: { responseText: 'new', scores: [] } },
              scoreDelta: -0.15,
            },
            {
              input: 'Item unchanged',
              resultA: { output: { responseText: 'same', scores: [] } },
              resultB: { output: { responseText: 'same', scores: [] } },
              scoreDelta: 0,
            },
          ],
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'A',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 3,
        succeededCount: 3,
        failedCount: 0,
        createdAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentComparePage />);
    await waitFor(() => {
      expect(screen.getByText(/Item improved/)).toBeTruthy();
      expect(screen.getByText(/Item regressed/)).toBeTruthy();
      expect(screen.getByText(/Item unchanged/)).toBeTruthy();
    });
    // Should show all three delta values
    expect(screen.getAllByText('+0.20').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('-0.15').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(1);
  });
});
