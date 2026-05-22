import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ scorerId: 'sc-1' }),
  useSearch: () => mockSearchParams,
  useNavigate: () => mockNavigate,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ScorerDetailPage } from './scorer-detail';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = {};
});

describe('ScorerDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ScorerDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders scorer name after loading', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'Checks faithfulness',
      versions: [{ versionNumber: 1, instructions: '', createdAt: '2025-01-01' }],
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Faithfulness')).toBeTruthy());
  });

  it('renders status badge for active scorer', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'Checks faithfulness',
      activeVersionId: 'v-1',
      versionNumber: 2,
      scoreRange: { min: 0, max: 1 },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('active')).toBeTruthy());
  });

  it('renders status badge for draft scorer', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Draft Scorer',
      type: 'custom',
      status: 'draft',
      description: null,
      activeVersionId: null,
      versionNumber: 1,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('draft')).toBeTruthy());
  });

  it('renders version number badge', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 3,
      scoreRange: { min: 0, max: 1 },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('v3')).toBeTruthy());
  });

  it('renders description text', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'Evaluates whether the response is faithful to the source.',
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() =>
      expect(screen.getByText('Evaluates whether the response is faithful to the source.')).toBeTruthy(),
    );
  });

  it('renders delete button', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
  });

  it('renders Archive button when scorer is active', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Active Scorer',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeTruthy());
  });

  it('renders Publish button when scorer is draft', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Draft Scorer',
      type: 'custom',
      status: 'draft',
      description: null,
      activeVersionId: null,
      versionNumber: null,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Publish')).toBeTruthy());
  });

  it('renders Restore button when scorer is archived', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Archived Scorer',
      type: 'faithfulness',
      status: 'archived',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Restore')).toBeTruthy());
  });

  it('renders Configuration and Versions tabs', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeTruthy();
      expect(screen.getByText('Versions')).toBeTruthy();
    });
  });

  it('renders tab triggers for Configuration and content area', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'A test scorer',
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      // Tab triggers are always visible
      expect(screen.getByRole('tab', { name: 'Configuration' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Versions' })).toBeTruthy();
    });
  });

  it('renders not found when scorer is null', async () => {
    mockApiFetch.mockResolvedValue(null);
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Scorer not found')).toBeTruthy());
  });

  it('renders breadcrumb link to scorers list', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: null,
      versionNumber: null,
      scoreRange: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Scorers')).toBeTruthy());
  });

  it('renders configuration tab content with form fields', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'Some desc',
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeTruthy();
      expect(screen.getByLabelText('Type')).toBeTruthy();
      expect(screen.getByLabelText('Description')).toBeTruthy();
    });
    // Score range inputs
    expect(screen.getByPlaceholderText('Min')).toBeTruthy();
    expect(screen.getByPlaceholderText('Max')).toBeTruthy();
    // Save Version and Preview buttons
    expect(screen.getByText('Save Version')).toBeTruthy();
    expect(screen.getByText('Preview')).toBeTruthy();
  });

  it('shows instructions textarea when type is custom', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'My Custom Scorer',
      type: 'custom',
      status: 'draft',
      description: null,
      activeVersionId: null,
      versionNumber: 1,
      scoreRange: null,
      instructions: 'Rate the answer carefully.',
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Instructions')).toBeTruthy();
    });
  });

  it('does not show instructions textarea for non-custom type', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'FaithScorer',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('FaithScorer')).toBeTruthy());
    expect(screen.queryByLabelText('Instructions')).toBeFalsy();
  });

  it('renders version list in versions tab', async () => {
    mockSearchParams = { tab: 'versions' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/versions')) {
        return Promise.resolve({
          versions: [
            {
              id: 'v-2',
              versionNumber: 2,
              name: 'Faithfulness',
              type: 'faithfulness',
              description: 'Updated desc',
              instructions: null,
              model: null,
              scoreRange: { min: 0, max: 1 },
              changedFields: ['description'],
              changeMessage: 'Updated description',
              createdAt: '2025-01-15T00:00:00Z',
            },
            {
              id: 'v-1',
              versionNumber: 1,
              name: 'Faithfulness',
              type: 'faithfulness',
              description: 'Initial',
              instructions: null,
              model: null,
              scoreRange: { min: 0, max: 1 },
              changedFields: null,
              changeMessage: 'Initial version',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: '' });
      }
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-2',
        versionNumber: 2,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      // v2 appears in header badge AND version list, so getAllByText
      expect(screen.getAllByText('v2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('v1').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Updated description')).toBeTruthy();
    expect(screen.getByText('Initial version')).toBeTruthy();
  });

  it('renders "No versions yet." when version list is empty', async () => {
    mockSearchParams = { tab: 'versions' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/versions')) {
        return Promise.resolve({ versions: [] });
      }
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: '' });
      }
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: null,
        versionNumber: null,
        scoreRange: null,
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('No versions yet.')).toBeTruthy());
  });

  it('shows Edit and Publish buttons for non-active versions', async () => {
    mockSearchParams = { tab: 'versions' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/versions')) {
        return Promise.resolve({
          versions: [
            {
              id: 'v-2',
              versionNumber: 2,
              name: 'Faithfulness',
              type: 'faithfulness',
              description: null,
              instructions: null,
              model: null,
              scoreRange: { min: 0, max: 1 },
              changedFields: null,
              changeMessage: null,
              createdAt: '2025-01-15T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: '' });
      }
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-999', // different from v-2
        versionNumber: 1,
        scoreRange: null,
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy();
      // The Publish button in the version entry (not the page-level Publish)
      expect(screen.getByText('Publish')).toBeTruthy();
    });
  });

  it('calls apiFetch with POST to publish endpoint when Publish button clicked (draft)', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Draft Scorer',
      type: 'faithfulness',
      status: 'draft',
      description: null,
      activeVersionId: null,
      versionNumber: 1,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Publish')).toBeTruthy());
    await user.click(screen.getByText('Publish'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1/publish',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('calls apiFetch with PATCH to archive when Archive button clicked', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Active Scorer',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Archive')).toBeTruthy());
    await user.click(screen.getByText('Archive'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'archived' }),
        }),
      );
    });
  });

  it('calls apiFetch with PATCH to restore when Restore button clicked', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Archived Scorer',
      type: 'faithfulness',
      status: 'archived',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Restore')).toBeTruthy());
    await user.click(screen.getByText('Restore'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'draft' }),
        }),
      );
    });
  });

  it('opens delete dialog and calls DELETE when confirmed', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Scorer To Delete',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
    // Click the Delete button to open dialog
    await user.click(screen.getByText('Delete'));
    // Dialog content should appear
    await waitFor(() => {
      expect(screen.getByText('Delete Scorer')).toBeTruthy();
      expect(screen.getByText(/permanently delete/)).toBeTruthy();
    });
    // Click the destructive Delete button in the dialog
    const deleteButtons = screen.getAllByText('Delete');
    // The second one is in the dialog footer
    const dialogDeleteBtn =
      deleteButtons.find((btn) => btn.closest('[role="dialog"]') || btn.closest('[data-state]')) ??
      deleteButtons[deleteButtons.length - 1];
    await user.click(dialogDeleteBtn);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('renders "Unnamed Scorer" when name is null', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: null,
      type: 'faithfulness',
      status: 'draft',
      description: null,
      activeVersionId: null,
      versionNumber: null,
      scoreRange: null,
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => expect(screen.getByText('Unnamed Scorer')).toBeTruthy());
  });

  it('populates form fields from scorer data on load', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'My Scorer',
      type: 'custom',
      status: 'draft',
      description: 'A desc',
      activeVersionId: null,
      versionNumber: 1,
      scoreRange: { min: 1, max: 5 },
      instructions: 'Judge this carefully.',
      model: { id: 'openai/gpt-4' },
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('My Scorer');
    });
    const descInput = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(descInput.value).toBe('A desc');
    const instrInput = screen.getByLabelText('Instructions') as HTMLTextAreaElement;
    expect(instrInput.value).toBe('Judge this carefully.');
  });

  it('opens preview sheet with input fields and run button', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    await user.click(screen.getByText('Preview'));
    // Preview sheet should open with input fields
    await waitFor(() => {
      expect(screen.getByPlaceholderText('What did the user ask?')).toBeTruthy();
      expect(screen.getByPlaceholderText('What did the agent respond?')).toBeTruthy();
      expect(screen.getByPlaceholderText('One chunk per line...')).toBeTruthy();
      expect(screen.getByText('Run Preview')).toBeTruthy();
    });
  });

  it('runs preview and calls apiFetch with POST to preview endpoint', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    await user.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByPlaceholderText('What did the user ask?')).toBeTruthy());
    await user.type(screen.getByPlaceholderText('What did the user ask?'), 'Test question');
    await user.type(screen.getByPlaceholderText('What did the agent respond?'), 'Test response');
    await user.click(screen.getByText('Run Preview'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1/preview',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('populates model dropdown from models endpoint', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/models')) {
        return Promise.resolve({ models: ['openai/gpt-4', 'anthropic/claude-3'], defaultModel: 'openai/gpt-4' });
      }
      if (url.includes('/versions')) return Promise.resolve({ versions: [] });
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeTruthy();
    });
    // System default label should appear with model name
    expect(screen.getByText(/System default.*gpt-4/)).toBeTruthy();
  });

  it('renders preview result after running preview', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      })
      .mockResolvedValueOnce({ versions: [] })
      .mockResolvedValueOnce({ models: [], defaultModel: '' })
      // The preview result
      .mockResolvedValueOnce({ score: 0.87, reason: 'Faithful to source material', durationMs: 1234 });

    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    await user.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByPlaceholderText('What did the user ask?')).toBeTruthy());
    await user.type(screen.getByPlaceholderText('What did the user ask?'), 'Test question');
    await user.type(screen.getByPlaceholderText('What did the agent respond?'), 'Test response');
    await user.type(screen.getByPlaceholderText('One chunk per line...'), 'chunk1\nchunk2');
    await user.click(screen.getByText('Run Preview'));
    await waitFor(() => {
      expect(screen.getByText('0.87')).toBeTruthy();
      expect(screen.getByText('1234ms')).toBeTruthy();
      expect(screen.getByText('Faithful to source material')).toBeTruthy();
    });
  });

  it('renders version entries with change messages and Edit/Publish buttons', async () => {
    mockSearchParams = { tab: 'versions' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/versions')) {
        return Promise.resolve({
          versions: [
            {
              id: 'v-2',
              versionNumber: 2,
              name: 'Updated Scorer',
              type: 'custom',
              description: 'Updated description',
              instructions: 'Rate carefully',
              model: { id: 'anthropic/claude-3' },
              scoreRange: { min: 0, max: 10 },
              changedFields: ['description', 'instructions'],
              changeMessage: 'Updated evaluation criteria',
              createdAt: '2025-01-15T00:00:00Z',
            },
            {
              id: 'v-1',
              versionNumber: 1,
              name: 'Initial Scorer',
              type: 'faithfulness',
              description: 'Original description',
              instructions: 'Rate it',
              model: { id: 'openai/gpt-4' },
              scoreRange: { min: 0, max: 1 },
              changedFields: null,
              changeMessage: 'Initial version',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: '' });
      }
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'custom',
        status: 'active',
        description: null,
        activeVersionId: 'v-999',
        versionNumber: 2,
        scoreRange: { min: 0, max: 10 },
        instructions: 'Rate carefully',
        model: { id: 'anthropic/claude-3' },
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getAllByText('v2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('v1').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Updated evaluation criteria')).toBeTruthy();
    expect(screen.getByText('Initial version')).toBeTruthy();
    // Both versions are non-active (activeVersionId='v-999'), so they show Edit+Publish
    expect(screen.getAllByText('Edit').length).toBeGreaterThanOrEqual(1);
  });

  it('opens save version dialog and submits new version', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Save Version')).toBeTruthy());
    await user.click(screen.getByText('Save Version'));
    // Dialog should open
    await waitFor(() => expect(screen.getByText('Save New Version')).toBeTruthy());
    // Fill the change message
    const messageInput = screen.getByPlaceholderText('What changed?');
    await user.type(messageInput, 'Tuned params');
    // Click the Save button inside dialog
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1/versions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('saves inline name edit', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Old Name',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeTruthy());
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    // Save version to persist the name change
    await user.click(screen.getByText('Save Version'));
    await waitFor(() => expect(screen.getByPlaceholderText('What changed?')).toBeTruthy());
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        (c) => c[0] === '/api/v1/admin/scorers/sc-1/versions' && (c[1] as Record<string, string>)?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as Record<string, string>).body);
      expect(body.name).toBe('New Name');
    });
  });

  it('saves inline description edit', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: 'Old desc',
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Description')).toBeTruthy());
    const descInput = screen.getByLabelText('Description') as HTMLTextAreaElement;
    await user.clear(descInput);
    await user.type(descInput, 'Updated description');
    // Save version to persist the description change
    await user.click(screen.getByText('Save Version'));
    await waitFor(() => expect(screen.getByPlaceholderText('What changed?')).toBeTruthy());
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        (c) => c[0] === '/api/v1/admin/scorers/sc-1/versions' && (c[1] as Record<string, string>)?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as Record<string, string>).body);
      expect(body.description).toBe('Updated description');
    });
  });

  it('switches to versions tab', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/versions')) {
        return Promise.resolve({
          versions: [
            {
              id: 'v-1',
              versionNumber: 1,
              name: 'Faithfulness',
              type: 'faithfulness',
              description: 'Initial',
              instructions: null,
              model: null,
              scoreRange: { min: 0, max: 1 },
              changedFields: null,
              changeMessage: 'Initial version',
              createdAt: '2025-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: '' });
      }
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Versions' })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    await waitFor(() => {
      expect(screen.getByText('Initial version')).toBeTruthy();
      expect(screen.getAllByText('v1').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows only system default when no models available', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/models')) {
        return Promise.resolve({ models: [], defaultModel: 'anthropic/claude-haiku-4-5' });
      }
      if (url.includes('/versions')) return Promise.resolve({ versions: [] });
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeTruthy();
    });
    expect(screen.getByText(/System default.*claude-haiku-4-5/)).toBeTruthy();
  });

  it('shows unavailable label for pinned model not in available list', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/models')) {
        return Promise.resolve({ models: ['anthropic/claude-haiku-4-5'], defaultModel: 'anthropic/claude-haiku-4-5' });
      }
      if (url.includes('/versions')) return Promise.resolve({ versions: [] });
      return Promise.resolve({
        id: 'sc-1',
        name: 'Faithfulness',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: { id: 'openai/gpt-4-removed' },
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeTruthy();
    });
    expect(screen.getByText(/gpt-4-removed.*unavailable/)).toBeTruthy();
    // Inline warning hint should appear below the selector
    expect(screen.getByText(/no longer in the approved list/)).toBeTruthy();
  });

  it('preserves form state after saving a version', async () => {
    mockSearchParams = { tab: 'configuration' };
    let callCount = 0;
    mockApiFetch.mockImplementation((url: string, opts?: Record<string, unknown>) => {
      if (url.includes('/models')) {
        return Promise.resolve({ models: ['anthropic/claude-haiku-4-5'], defaultModel: 'anthropic/claude-haiku-4-5' });
      }
      if (url.includes('/versions') && opts?.method === 'POST') {
        return Promise.resolve({ id: 'v-2', versionNumber: 2 });
      }
      if (url.includes('/versions')) return Promise.resolve({ versions: [] });
      callCount++;
      // Return different name on refetch to prove the form doesn't reset
      return Promise.resolve({
        id: 'sc-1',
        name: callCount > 1 ? 'Refetched Name' : 'Original Name',
        type: 'faithfulness',
        status: 'active',
        description: null,
        activeVersionId: 'v-1',
        versionNumber: 1,
        scoreRange: { min: 0, max: 1 },
        instructions: null,
        model: null,
      });
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Original Name');
    });
    // Change the name
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'My Edit');
    // Save version
    await user.click(screen.getByText('Save Version'));
    await waitFor(() => expect(screen.getByPlaceholderText('What changed?')).toBeTruthy());
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/scorers/sc-1/versions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // Form should still show user's edit, not the refetched value
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My Edit');
  });

  it('renders run panel with input area', async () => {
    mockSearchParams = { tab: 'configuration' };
    mockApiFetch.mockResolvedValue({
      id: 'sc-1',
      name: 'Faithfulness',
      type: 'faithfulness',
      status: 'active',
      description: null,
      activeVersionId: 'v-1',
      versionNumber: 1,
      scoreRange: { min: 0, max: 1 },
      instructions: null,
      model: null,
    });
    renderWithQueryClient(<ScorerDetailPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    await user.click(screen.getByText('Preview'));
    await waitFor(() => {
      // The preview panel should have input areas for question, response, and context
      expect(screen.getByPlaceholderText('What did the user ask?')).toBeTruthy();
      expect(screen.getByPlaceholderText('What did the agent respond?')).toBeTruthy();
      expect(screen.getByPlaceholderText('One chunk per line...')).toBeTruthy();
      // And a Run Preview button
      expect(screen.getByText('Run Preview')).toBeTruthy();
    });
  });
});
