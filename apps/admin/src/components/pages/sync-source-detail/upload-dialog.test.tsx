import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { UploadDialog } from './upload-dialog';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('UploadDialog', () => {
  it('renders dialog content when open', () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Upload Documents')).toBeTruthy();
    expect(screen.getByText(/Upload files directly to this sync source/)).toBeTruthy();
    expect(screen.getByText(/Drag & drop files here/)).toBeTruthy();
  });

  it('renders upload path input', () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText(/Select files to upload/)).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. docs/policies')).toBeTruthy();
  });

  it('renders cancel and upload buttons', () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Cancel/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload 0 files/ })).toBeTruthy();
  });

  it('upload button is disabled when no files selected', () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const uploadBtn = screen.getByRole('button', { name: /Upload 0 files/ });
    expect((uploadBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('populates default path from prop', () => {
    renderWithQueryClient(
      <UploadDialog sourceId="st-1" defaultPath="docs/policies/" open={true} onOpenChange={vi.fn()} />,
    );

    const pathInput = screen.getByPlaceholderText('e.g. docs/policies') as HTMLInputElement;
    expect(pathInput.value).toBe('docs/policies/');
  });

  it('does not render dialog content when closed', () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Upload Documents')).toBeNull();
  });

  it('updates file count display after selecting files via input', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const file2 = new File(['world'], 'world.txt', { type: 'text/plain' });

    await user.upload(fileInput, [file1, file2]);

    await waitFor(() => {
      expect(screen.getByText('2 files selected')).toBeTruthy();
    });
  });

  it('enables upload button after files are selected', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    // Initially disabled
    const uploadBtn = screen.getByRole('button', { name: /Upload 0 files/ });
    expect((uploadBtn as HTMLButtonElement).disabled).toBe(true);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      const enabledBtn = screen.getByRole('button', { name: /Upload 1 file\b/ });
      expect((enabledBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('calls apiFetch with FormData when upload button is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({});

    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload 1 file\b/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/sync-targets/st-1/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });
  });

  it('includes path in FormData when subPath is provided', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({});

    renderWithQueryClient(
      <UploadDialog sourceId="st-1" defaultPath="docs/policies/" open={true} onOpenChange={vi.fn()} />,
    );

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['content'], 'policy.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload 1 file\b/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      const callArgs = mockApiFetch.mock.calls.find((c) => c[0] === '/api/v1/sync-targets/st-1/upload');
      expect(callArgs).toBeDefined();
      const formData = (callArgs as unknown[])[1] as { body: FormData };
      expect(formData.body.get('path')).toBe('docs/policies/');
    });
  });

  it('shows correct count for multiple files selected', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const files = [
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['c'], 'c.txt', { type: 'text/plain' }),
    ];
    await user.upload(fileInput, files);

    await waitFor(() => {
      expect(screen.getByText('3 files selected')).toBeTruthy();
      // Upload button should show count
      expect(screen.getByRole('button', { name: /Upload 3 files/ })).toBeTruthy();
    });
  });

  it('shows file names and sizes in the selected file list', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['hello world content'], 'report.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeTruthy();
    });
  });

  it('removes a file when remove button is clicked', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file1 = new File(['a'], 'first.txt', { type: 'text/plain' });
    const file2 = new File(['b'], 'second.txt', { type: 'text/plain' });
    await user.upload(fileInput, [file1, file2]);

    await waitFor(() => {
      expect(screen.getByText('2 files selected')).toBeTruthy();
      expect(screen.getByText('first.txt')).toBeTruthy();
      expect(screen.getByText('second.txt')).toBeTruthy();
    });

    // Each file row has a remove button (the last button inside the file item div).
    // Find the file entry container for "first.txt" and click its remove button.
    const firstFileText = screen.getByText('first.txt');
    const fileRow = firstFileText.closest('.flex.items-center');
    expect(fileRow).toBeDefined();
    const removeBtn = (fileRow as Element).querySelector('button');
    expect(removeBtn).toBeDefined();
    await user.click(removeBtn as Element);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
      expect(screen.queryByText('first.txt')).toBeNull();
      expect(screen.getByText('second.txt')).toBeTruthy();
    });
  });

  it('calls onOpenChange(false) when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={onOpenChange} />);

    const cancelBtn = screen.getByRole('button', { name: /Cancel/ });
    await user.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows uploading state in button during upload', async () => {
    const user = userEvent.setup();
    // Keep the promise pending to hold the uploading state
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['content'], 'uploading.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload 1 file\b/ });
    await user.click(uploadBtn);

    // The button should show uploading state
    await waitFor(() => {
      expect(screen.getByText(/Uploading/)).toBeTruthy();
    });
  });

  it('reflects user-typed path value in the input', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const pathInput = screen.getByPlaceholderText('e.g. docs/policies') as HTMLInputElement;
    await user.clear(pathInput);
    await user.type(pathInput, 'custom/path');

    expect(pathInput.value).toBe('custom/path');
  });

  it('applies drag highlight class on dragOver and removes on dragLeave', async () => {
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const dropZone = screen.getByText(/Drag & drop files here/).closest('button') as Element;
    expect(dropZone).toBeDefined();

    // Simulate dragOver
    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dragOverEvent, 'stopPropagation', { value: vi.fn() });
    dropZone.dispatchEvent(dragOverEvent);

    await waitFor(() => {
      // After dragOver, the text should change to "Drop files here"
      expect(screen.getByText('Drop files here')).toBeTruthy();
    });

    // Simulate dragLeave
    const dragLeaveEvent = new Event('dragleave', { bubbles: true });
    Object.defineProperty(dragLeaveEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(dragLeaveEvent, 'stopPropagation', { value: vi.fn() });
    dropZone.dispatchEvent(dragLeaveEvent);

    await waitFor(() => {
      expect(screen.getByText(/Drag & drop files here/)).toBeTruthy();
    });
  });

  it('shows error message when upload fails', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('Upload failed: 413 Payload too large'));

    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file = new File(['big content'], 'huge.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload 1 file\b/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByText(/Upload failed/)).toBeTruthy();
    });
  });

  it('does not add duplicate files (same name and size)', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<UploadDialog sourceId="st-1" open={true} onOpenChange={vi.fn()} />);

    const fileInput = screen.getByLabelText('Select files to upload');
    const file1 = new File(['hello'], 'test.txt', { type: 'text/plain' });
    await user.upload(fileInput, file1);

    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });

    // Upload the same file again
    const file2 = new File(['hello'], 'test.txt', { type: 'text/plain' });
    await user.upload(fileInput, file2);

    // Should still be 1 file (duplicate filtered)
    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeTruthy();
    });
  });
});
