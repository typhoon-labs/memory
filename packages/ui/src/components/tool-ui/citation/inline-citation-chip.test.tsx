import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
});
