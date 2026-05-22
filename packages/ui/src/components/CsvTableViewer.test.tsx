import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CsvTableViewer, normalizeRows, parseCsv, parseCsvRow } from './CsvTableViewer';

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

  it('renders multiple data rows', () => {
    render(<CsvTableViewer text={'Name,Age,City\nAlice,30,NYC\nBob,25,LA\nCharlie,35,SF'} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Charlie')).toBeTruthy();
    expect(screen.getByText('NYC')).toBeTruthy();
    expect(screen.getByText('LA')).toBeTruthy();
    expect(screen.getByText('SF')).toBeTruthy();
  });

  it('renders header-only CSV (no data rows)', () => {
    render(<CsvTableViewer text={'Name,Age'} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Age')).toBeTruthy();
    // Should only have thead, no tbody rows
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1); // just the header row
  });

  it('renders multi-sheet XLSX format with sheet names', () => {
    const text = '## Sheet: Sales\n\nProduct,Revenue\nWidget,1000\n\n## Sheet: Costs\n\nItem,Amount\nRent,500';
    render(<CsvTableViewer text={text} />);
    expect(screen.getByText('Sales')).toBeTruthy();
    expect(screen.getByText('Costs')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Widget')).toBeTruthy();
    expect(screen.getByText('Item')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
  });

  it('highlights search terms in cells', () => {
    const { container } = render(<CsvTableViewer text={'Name,Age\nAlice,30'} searchTerms={['Alice']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('Alice');
  });

  it('handles CSV with empty fields gracefully', () => {
    render(<CsvTableViewer text={'A,B,C\n1,,3\n,2,'} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('normalizeRows', () => {
  it('pads short rows with empty strings', () => {
    const rows = [
      ['A', 'B', 'C'],
      ['1', '2'],
    ];
    const result = normalizeRows(rows);
    expect(result[1]).toEqual(['1', '2', '']);
  });

  it('trims long rows to header length', () => {
    const rows = [
      ['A', 'B'],
      ['1', '2', '3', '4'],
    ];
    const result = normalizeRows(rows);
    expect(result[1]).toEqual(['1', '2']);
  });

  it('returns empty array unchanged', () => {
    expect(normalizeRows([])).toEqual([]);
  });

  it('parseCsv filters out blank lines', () => {
    const result = parseCsv('a,b\n\nc,d\n\n');
    expect(result).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
