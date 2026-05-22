import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineCitationChip } from './inline-citation-chip';

afterEach(cleanup);

describe('InlineCitationChip', () => {
  it('renders citation index', () => {
    render(<InlineCitationChip citation={{ index: 1, title: 'Doc.pdf', documentId: 'd-1' }} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders citation', () => {
    const { container } = render(
      <InlineCitationChip citation={{ index: 2, title: 'Report.docx', documentId: 'd-2' }} />,
    );
    expect(container.textContent).toContain('2');
  });

  it('uses displayIndex when provided (strips sub-index)', () => {
    render(<InlineCitationChip citation={{ index: 3, title: 'T', documentId: 'd-1', displayIndex: '5.2' }} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('has accessible label with citation number and title', () => {
    render(<InlineCitationChip citation={{ index: 1, title: 'My Document', documentId: 'd-1' }} />);
    expect(screen.getByLabelText('Citation 1: My Document')).toBeTruthy();
  });

  it('calls onDocumentOpen with single chunk data on click', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(
      <InlineCitationChip
        citation={{ index: 1, title: 'T', documentId: 'd-1', startIndex: 100, chunkText: 'hello' }}
        onDocumentOpen={handler}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledWith('d-1', { startIndex: 100, chunkText: 'hello' });
  });

  it('calls onDocumentOpen with multi-chunk data when children present', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(
      <InlineCitationChip
        citation={{
          index: 1,
          title: 'T',
          documentId: 'd-1',
          children: [
            { index: 1, title: 'T', startIndex: 0, chunkText: 'a' },
            { index: 2, title: 'T', startIndex: 50, chunkText: 'b' },
          ],
        }}
        onDocumentOpen={handler}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledWith('d-1', {
      chunks: [
        { startIndex: 0, chunkText: 'a' },
        { startIndex: 50, chunkText: 'b' },
      ],
    });
  });

  it('does not call onDocumentOpen when documentId is missing', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<InlineCitationChip citation={{ index: 1, title: 'T' }} onDocumentOpen={handler} />);
    await user.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });
});
