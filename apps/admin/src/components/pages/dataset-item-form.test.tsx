import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={to as string} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
  useParams: vi.fn(() => ({ datasetId: 'ds-1', itemId: undefined })),
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { useParams } from '@tanstack/react-router';
import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { DatasetItemFormPage } from './dataset-item-form';

const mockApiFetch = vi.mocked(apiFetch);
const mockUseParams = vi.mocked(useParams);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ datasetId: 'ds-1', itemId: undefined } as ReturnType<typeof useParams>);
});

describe('DatasetItemFormPage', () => {
  describe('create mode', () => {
    it('renders form fields for creating a new item', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        // "Add Item" appears in both the breadcrumb and the submit button
        expect(screen.getAllByText('Add Item').length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getByLabelText('Input Question')).toBeTruthy();
      expect(screen.getByLabelText('Expected Output / Ground Truth')).toBeTruthy();
      expect(screen.getByPlaceholderText('Enter the question or input...')).toBeTruthy();
      expect(screen.getByPlaceholderText('Enter the expected answer...')).toBeTruthy();
    });

    it('renders breadcrumb navigation links', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        const datasetsLink = screen.getByText('Datasets').closest('a');
        expect(datasetsLink?.getAttribute('href')).toBe('/datasets');
        expect(screen.getByText('My Dataset')).toBeTruthy();
      });
    });

    it('disables Add Item button when input is empty', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        const submitButtons = screen.getAllByText('Add Item');
        const submitButton = submitButtons.find((el) => el.closest('button'));
        expect(submitButton?.closest('button')?.disabled).toBe(true);
      });
    });

    it('enables Add Item button when input has content', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      const inputField = screen.getByPlaceholderText('Enter the question or input...');
      fireEvent.change(inputField, { target: { value: 'What is the return policy?' } });

      const submitButtons = screen.getAllByText('Add Item');
      const submitButton = submitButtons.find((el) => el.closest('button'));
      expect(submitButton?.closest('button')?.disabled).toBe(false);
    });

    it('does not show delete button in create mode', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      expect(screen.queryByText('Delete')).toBeNull();
    });

    it('renders cancel button', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('submits new item via POST', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      const inputField = screen.getByPlaceholderText('Enter the question or input...');
      const outputField = screen.getByPlaceholderText('Enter the expected answer...');
      fireEvent.change(inputField, { target: { value: 'What is the return policy?' } });
      fireEvent.change(outputField, { target: { value: 'You can return within 30 days.' } });

      const submitButtons = screen.getAllByText('Add Item');
      const submitButton = submitButtons.find((el) => el.closest('button'));
      expect(submitButton).toBeTruthy();
      fireEvent.click(submitButton?.closest('button') as HTMLElement);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/v1/admin/datasets/ds-1/items',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              input: { question: 'What is the return policy?' },
              groundTruth: { answer: 'You can return within 30 days.' },
            }),
          }),
        );
      });
    });

    it('navigates back to dataset on successful save', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      const inputField = screen.getByPlaceholderText('Enter the question or input...');
      fireEvent.change(inputField, { target: { value: 'Test question' } });

      const submitButtons = screen.getAllByText('Add Item');
      const submitButton = submitButtons.find((el) => el.closest('button'));
      expect(submitButton).toBeTruthy();
      fireEvent.click(submitButton?.closest('button') as HTMLElement);

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith({
          to: '/datasets/$datasetId',
          params: { datasetId: 'ds-1' },
        });
      });
    });

    it('renders section header and description', async () => {
      mockApiFetch.mockResolvedValue({ id: 'ds-1', name: 'My Dataset' });

      renderWithQueryClient(<DatasetItemFormPage />);

      expect(screen.getByText('Test Case')).toBeTruthy();
      expect(screen.getByText('Define the input question and expected output for evaluation.')).toBeTruthy();
    });
  });

  describe('edit mode', () => {
    beforeEach(() => {
      mockUseParams.mockReturnValue({ datasetId: 'ds-1', itemId: 'item-1' } as ReturnType<typeof useParams>);
    });

    it('shows loading spinner while fetching item', () => {
      // Dataset query resolves, items query never resolves
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      const { container } = renderWithQueryClient(<DatasetItemFormPage />);
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows not found when item does not exist', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({ items: [] });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        expect(screen.getByText('Item not found.')).toBeTruthy();
      });
    });

    it('populates form with existing item data', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Existing question' },
            groundTruth: { answer: 'Existing answer' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        const inputField = screen.getByPlaceholderText('Enter the question or input...') as HTMLTextAreaElement;
        expect(inputField.value).toBe('Existing question');
        const outputField = screen.getByPlaceholderText('Enter the expected answer...') as HTMLTextAreaElement;
        expect(outputField.value).toBe('Existing answer');
      });
    });

    it('shows Edit Item title and Save button in edit mode', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q' },
            groundTruth: { answer: 'A' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        expect(screen.getByText('Edit Item')).toBeTruthy();
        expect(screen.getByText('Save')).toBeTruthy();
      });
    });

    it('shows delete button in edit mode', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q' },
            groundTruth: { answer: 'A' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeTruthy();
      });
    });

    it('submits edit via PATCH', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Old Q' },
            groundTruth: { answer: 'Old A' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeTruthy();
      });

      // Update the input
      const inputField = screen.getByPlaceholderText('Enter the question or input...') as HTMLTextAreaElement;
      fireEvent.change(inputField, { target: { value: 'Updated Q' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/api/v1/admin/datasets/ds-1/items/item-1',
          expect.objectContaining({ method: 'PATCH' }),
        );
      });
    });

    it('navigates back on cancel in edit mode', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'ds-1', name: 'My Dataset' }).mockResolvedValueOnce({
        items: [
          {
            id: 'item-1',
            datasetId: 'ds-1',
            input: { question: 'Q' },
            groundTruth: { answer: 'A' },
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
      });

      renderWithQueryClient(<DatasetItemFormPage />);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Cancel'));

      expect(navigateMock).toHaveBeenCalledWith({
        to: '/datasets/$datasetId',
        params: { datasetId: 'ds-1' },
      });
    });
  });
});
