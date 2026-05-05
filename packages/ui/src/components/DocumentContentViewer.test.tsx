import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentContentViewer } from './DocumentContentViewer';

afterEach(cleanup);

describe('DocumentContentViewer', () => {
  it('renders markdown text', () => {
    const { container } = render(<DocumentContentViewer text="# Hello World" mimeType="text/markdown" />);
    expect(container.textContent).toContain('Hello World');
  });

  it('renders CSV text as a table', () => {
    const { container } = render(<DocumentContentViewer text="Name,Age\nAlice,30" mimeType="text/csv" />);
    expect(container.textContent).toContain('Alice');
  });

  it('renders plain text', () => {
    const { container } = render(<DocumentContentViewer text="Plain text here" mimeType="text/plain" />);
    expect(container.textContent).toContain('Plain text here');
  });
});
