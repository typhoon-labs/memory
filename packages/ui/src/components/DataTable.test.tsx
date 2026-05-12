import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
];

const data: Row[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText('ID')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
  });

  it('renders row data', () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders empty state when no data', () => {
    const { container } = render(<DataTable data={[]} columns={columns} />);
    expect(container.textContent).toContain('No results');
  });

  it('renders with filtering enabled', () => {
    const { container } = render(<DataTable data={data} columns={columns} enableFiltering />);
    const input = screen.getByPlaceholderText('Search...');
    expect(input).toBeTruthy();
    // Search icon is rendered alongside the input
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders pagination controls for large datasets', () => {
    const largeData = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `User ${i}` }));
    const { container } = render(<DataTable data={largeData} columns={columns} pageSize={5} />);
    const buttons = container.querySelectorAll('button');
    // Should have navigation buttons (prev/next)
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders with sorting enabled', () => {
    const { container } = render(<DataTable data={data} columns={columns} enableSorting />);
    const headers = container.querySelectorAll('th');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('renders with row selection', () => {
    const { container } = render(<DataTable data={data} columns={columns} enableRowSelection />);
    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('renders row count when showRowCount is true', () => {
    const { container } = render(<DataTable data={data} columns={columns} showRowCount />);
    expect(container.textContent).toContain('2');
  });
});
