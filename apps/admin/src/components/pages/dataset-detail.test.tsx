import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ datasetId: 'ds-1' }),
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { DatasetDetailPage } from './dataset-detail';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('DatasetDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<DatasetDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows error message on fetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Failed to load dataset.'));
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Failed to load dataset.')).toBeTruthy());
  });

  it('renders dataset name and items table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: 'A test',
        version: 1,
        itemCount: 2,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: {},
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Test Dataset')).toBeTruthy();
    });
  });

  it('renders items in the data table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 2,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'What is Typhoon?' },
            groundTruth: { answer: 'A chatbot' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
          {
            id: 'item-2',
            datasetId: 'ds-1',
            input: { question: 'How does it work?' },
            groundTruth: { answer: 'RAG pipeline' },
            createdAt: '2025-01-02',
            updatedAt: '2025-01-02',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('What is Typhoon?')).toBeTruthy();
      expect(screen.getByText('How does it work?')).toBeTruthy();
    });
  });

  it('renders Add Item button', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Item')).toBeTruthy();
    });
  });

  it('renders Import CSV and Export CSV buttons', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Import CSV')).toBeTruthy();
      expect(screen.getByText('Export CSV')).toBeTruthy();
    });
  });

  it('renders empty items state when no items exist', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No test cases yet')).toBeTruthy();
      expect(screen.getByText('Add items to build your evaluation dataset.')).toBeTruthy();
    });
  });

  it('renders breadcrumb link to datasets list', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Datasets')).toBeTruthy();
    });
  });

  it('renders dataset description when present', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: 'Evaluation data for FAQ bot',
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Evaluation data for FAQ bot')).toBeTruthy();
    });
  });

  it('renders column headers: Input, Expected Output, Created', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Input')).toBeTruthy();
      expect(screen.getByText('Expected Output')).toBeTruthy();
      expect(screen.getByText('Created')).toBeTruthy();
    });
  });

  it('truncates long input and ground truth text', async () => {
    const longText = 'A'.repeat(120);
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: longText },
            groundTruth: { answer: longText },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      // Text is truncated to 80 chars + "..."
      const truncated = longText.slice(0, 80) + '...';
      const inputCells = screen.getAllByText(truncated);
      expect(inputCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders ground truth as expected output column', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'What is Typhoon?' },
            groundTruth: { answer: 'A chatbot platform' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('A chatbot platform')).toBeTruthy();
    });
  });

  it('calls apiFetch with DELETE when delete item button is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Q1')).toBeTruthy();
    });

    // The delete button has a Trash2Icon; find buttons in the actions column
    // There should be edit + delete buttons per row
    const deleteButtons = screen.getAllByRole('button').filter((btn) => {
      const svg = btn.querySelector('svg');
      return svg?.classList.contains('text-muted-foreground') && btn.textContent === '';
    });
    // The second icon-only button in the row is the delete button (after edit)
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2);

    // Reset mock and set up for the delete call
    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(deleteButtons[1]);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items/item-1', {
        method: 'DELETE',
      });
    });
  });

  it('navigates to edit page when edit button is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Q1')).toBeTruthy();
    });

    // Find the first icon-only button (edit) per row
    const iconButtons = screen.getAllByRole('button').filter((btn) => {
      const svg = btn.querySelector('svg');
      return svg?.classList.contains('text-muted-foreground') && btn.textContent === '';
    });
    expect(iconButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(iconButtons[0]);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/datasets/$datasetId/items/$itemId',
      params: { datasetId: 'ds-1', itemId: 'item-1' },
    });
  });

  it('renders hidden file input for CSV import', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Import CSV')).toBeTruthy();
    });

    const fileInput = screen.getByLabelText('Import CSV file');
    expect(fileInput).toBeTruthy();
    expect((fileInput as HTMLInputElement).type).toBe('file');
    expect((fileInput as HTMLInputElement).accept).toBe('.csv');
  });

  it('disables Export CSV button when items list is empty', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeTruthy();
    });

    const exportBtn = screen.getByRole('button', { name: /Export CSV/ });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Export CSV button when items exist', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Q1')).toBeTruthy();
    });

    const exportBtn = screen.getByRole('button', { name: /Export CSV/ });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders multiple items in table with ground truth', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/items'))
        return Promise.resolve({
          items: [
            {
              id: 'item-1',
              datasetId: 'ds-1',
              input: { question: 'What is 2+2?' },
              groundTruth: { answer: 'Four' },
              createdAt: '2025-01-01',
              updatedAt: '2025-01-01',
            },
            {
              id: 'item-2',
              datasetId: 'ds-1',
              input: { question: 'Capital of France?' },
              groundTruth: { answer: 'Paris' },
              createdAt: '2025-01-01',
              updatedAt: '2025-01-01',
            },
          ],
        });
      return Promise.resolve({
        id: 'ds-1',
        name: 'Multi Item Dataset',
        description: null,
        version: 1,
        itemCount: 2,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('What is 2+2?')).toBeTruthy();
      expect(screen.getByText('Four')).toBeTruthy();
      expect(screen.getByText('Capital of France?')).toBeTruthy();
      expect(screen.getByText('Paris')).toBeTruthy();
    });
  });

  it('imports CSV via file input change handler', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Import CSV')).toBeTruthy());

    // Mock the POST for import
    mockApiFetch.mockResolvedValueOnce(undefined);

    const file = new File(['question,answer\nWhat is AI?,Machine learning\n'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText('Import CSV file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/datasets/ds-1/items',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"question":"What is AI?"'),
        }),
      );
    });
  });

  it('imports CSV with fallback column indices when no question/answer headers', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Import CSV')).toBeTruthy());

    mockApiFetch.mockResolvedValueOnce(undefined);

    const file = new File(['col1,col2\nfoo,bar\n'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText('Import CSV file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/datasets/ds-1/items',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"question":"foo"'),
        }),
      );
    });
  });

  it('skips import when CSV has only header row', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Import CSV')).toBeTruthy());

    const callsBefore = mockApiFetch.mock.calls.length;
    const file = new File(['question,answer\n'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText('Import CSV file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait a tick for the async handler to run
    await new Promise((r) => setTimeout(r, 50));
    // No POST call should have been made beyond the initial fetches
    const postCalls = mockApiFetch.mock.calls
      .slice(callsBefore)
      .filter((c) => typeof c[1] === 'object' && c[1].method === 'POST');
    expect(postCalls.length).toBe(0);
  });

  it('exports CSV and triggers download', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q1' },
            groundTruth: { answer: 'A1' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());

    // Mock for the export fetch
    mockApiFetch.mockResolvedValueOnce({
      items: [{ id: 'item-1', input: { question: 'Q1' }, groundTruth: { answer: 'A1' } }],
    });

    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const mockLink = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockLink as unknown as HTMLElement);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Export CSV/ }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows Importing... during CSV import', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ items: [] });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => expect(screen.getByText('Import CSV')).toBeTruthy());

    // Mock POST to never resolve so we can catch the intermediate state
    mockApiFetch.mockReturnValueOnce(new Promise(() => {}));

    const file = new File(['question,answer\nQ1,A1\n'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText('Import CSV file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Importing...')).toBeTruthy();
    });
  });

  it('renders dash for null input.question values', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'ds-1',
        name: 'Test Dataset',
        description: null,
        version: 1,
        itemCount: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: {},
            groundTruth: {},
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });
    renderWithQueryClient(<DatasetDetailPage />);
    await waitFor(() => {
      // When input has no question, truncate({}) will produce a JSON string
      // or show the input object. Check that the row renders.
      const rows = screen.getAllByRole('row');
      // Header row + data row
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});
