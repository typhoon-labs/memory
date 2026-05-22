import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={to as string} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => navigateMock,
  useSearch: () => ({ status: 'all' }),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ScorersPage } from './scorers';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('ScorersPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ScorersPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders scorer rows when data loads', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-1',
          name: 'Faithfulness Check',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-2',
          name: 'Custom Judge',
          type: 'custom',
          status: 'draft',
          description: null,
          versionNumber: null,
          updatedAt: '2025-01-01',
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Faithfulness Check')).toBeTruthy();
      expect(screen.getByText('Custom Judge')).toBeTruthy();
    });
  });

  it('shows empty state when no scorers and no filters', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [], total: 0 });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => expect(screen.getByText('No scorers yet')).toBeTruthy());
  });

  it('renders create scorer link', async () => {
    mockApiFetch.mockResolvedValue({ scorers: [], total: 0 });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      const link = screen.getByText('Create Scorer').closest('a');
      expect(link?.getAttribute('href')).toBe('/scorers/create');
    });
  });

  it('renders version column with "v1" format', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-v',
          name: 'Versioned Scorer',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 3,
          updatedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeTruthy();
    });
  });

  it('renders status badge variants for active, draft, archived', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-1',
          name: 'Active One',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-2',
          name: 'Draft One',
          type: 'custom',
          status: 'draft',
          description: null,
          versionNumber: null,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-3',
          name: 'Archived One',
          type: 'hallucination',
          status: 'archived',
          description: null,
          versionNumber: 2,
          updatedAt: '2025-01-01',
        },
      ],
      total: 3,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('active')).toBeTruthy();
      expect(screen.getByText('draft')).toBeTruthy();
      expect(screen.getByText('archived')).toBeTruthy();
    });
  });

  it('renders type label mapping correctly', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-f',
          name: 'Faith',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-c',
          name: 'Judge',
          type: 'custom',
          status: 'draft',
          description: null,
          versionNumber: null,
          updatedAt: '2025-01-01',
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Faithfulness')).toBeTruthy();
      expect(screen.getByText('Custom (LLM Judge)')).toBeTruthy();
    });
  });

  it('renders dash for null version number', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-n',
          name: 'No Version',
          type: 'faithfulness',
          status: 'draft',
          description: null,
          versionNumber: null,
          updatedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('No Version')).toBeTruthy();
    });
    expect(screen.getByText('\u2014')).toBeTruthy();
  });

  it('renders dash for null name', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-nn',
          name: null,
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      // Name column shows dash for null
      const dashes = screen.getAllByText('\u2014');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-h',
          name: 'Headers',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Type')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Version')).toBeTruthy();
      expect(screen.getByText('Updated')).toBeTruthy();
    });
  });

  it('navigates to scorer detail on row click', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-click',
          name: 'Clickable Scorer',
          type: 'faithfulness',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Clickable Scorer')).toBeTruthy();
    });
    // Click the table row containing the scorer name
    const row = screen.getByText('Clickable Scorer').closest('tr');
    expect(row).toBeTruthy();
    await user.click(row!);
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/scorers/$scorerId',
      params: { scorerId: 'sc-click' },
    });
  });

  it('shows warning icon for scorer with unavailable pinned model', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/models')) {
        return Promise.resolve({ models: ['anthropic/claude-haiku-4-5'], defaultModel: 'anthropic/claude-haiku-4-5' });
      }
      return Promise.resolve({
        scorers: [
          {
            id: 'sc-ok',
            name: 'Good Model',
            type: 'faithfulness',
            status: 'active',
            description: null,
            model: { id: 'anthropic/claude-haiku-4-5' },
            versionNumber: 1,
            updatedAt: '2025-01-01',
          },
          {
            id: 'sc-bad',
            name: 'Stale Model',
            type: 'faithfulness',
            status: 'active',
            description: null,
            model: { id: 'openai/gpt-4-removed' },
            versionNumber: 1,
            updatedAt: '2025-01-01',
          },
          {
            id: 'sc-null',
            name: 'Default Model',
            type: 'faithfulness',
            status: 'active',
            description: null,
            model: null,
            versionNumber: 1,
            updatedAt: '2025-01-01',
          },
        ],
        total: 3,
      });
    });
    const { container } = renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Good Model')).toBeTruthy();
      expect(screen.getByText('Stale Model')).toBeTruthy();
      expect(screen.getByText('Default Model')).toBeTruthy();
    });
    // Only the stale model row should have a warning icon
    const warningIcons = container.querySelectorAll('.text-amber-400');
    expect(warningIcons).toHaveLength(1);
    // The warning should be in the same row as "Stale Model"
    const staleRow = screen.getByText('Stale Model').closest('tr');
    expect(staleRow?.querySelector('.text-amber-400')).toBeTruthy();
  });

  it('renders type labels correctly for all known types', async () => {
    mockApiFetch.mockResolvedValue({
      scorers: [
        {
          id: 'sc-t1',
          name: 'Hallucination Scorer',
          type: 'hallucination',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-t2',
          name: 'Relevancy Scorer',
          type: 'answerRelevancy',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-t3',
          name: 'Context Relevance Scorer',
          type: 'contextRelevance',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-t4',
          name: 'Context Precision Scorer',
          type: 'contextPrecision',
          status: 'active',
          description: null,
          versionNumber: 1,
          updatedAt: '2025-01-01',
        },
        {
          id: 'sc-t5',
          name: 'Unknown Type Scorer',
          type: 'someUnknownType',
          status: 'draft',
          description: null,
          versionNumber: null,
          updatedAt: '2025-01-01',
        },
      ],
      total: 5,
    });
    renderWithQueryClient(<ScorersPage />);
    await waitFor(() => {
      expect(screen.getByText('Hallucination')).toBeTruthy();
      expect(screen.getByText('Answer Relevancy')).toBeTruthy();
      expect(screen.getByText('Context Relevance')).toBeTruthy();
      expect(screen.getByText('Context Precision')).toBeTruthy();
      // Unknown type falls back to raw type string
      expect(screen.getByText('someUnknownType')).toBeTruthy();
    });
  });
});
