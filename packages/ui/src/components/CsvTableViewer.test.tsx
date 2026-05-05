import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CsvTableViewer, parseCsvRow } from './CsvTableViewer';

afterEach(cleanup);

describe('parseCsvRow', () => {
  it('parses simple comma-separated values', () => {
    expect(parseCsvRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsvRow('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  it('handles escaped quotes', () => {
    expect(parseCsvRow('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles empty fields', () => {
    expect(parseCsvRow('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('CsvTableViewer', () => {
  it('renders a table from CSV text', () => {
    render(<CsvTableViewer text={'Name,Age\nAlice,30\nBob,25'} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('renders empty state for empty text', () => {
    const { container } = render(<CsvTableViewer text="" />);
    expect(container).toBeTruthy();
  });
});
