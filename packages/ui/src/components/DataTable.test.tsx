import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('calls onRowClick when a row is clicked', () => {
    const onRowClick = vi.fn();
    render(<DataTable data={data} columns={columns} onRowClick={onRowClick} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is the header, rows[1] is the first data row
    fireEvent.click(rows[1]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'Alice' });
  });

  it('calls onRowHover when a row is hovered', () => {
    const onRowHover = vi.fn();
    render(<DataTable data={data} columns={columns} onRowHover={onRowHover} />);
    const rows = screen.getAllByRole('row');
    fireEvent.mouseEnter(rows[1]);
    expect(onRowHover).toHaveBeenCalledTimes(1);
    expect(onRowHover).toHaveBeenCalledWith({ id: '1', name: 'Alice' });
  });

  it('renders toolbar slot', () => {
    render(
      <DataTable data={data} columns={columns} toolbar={<div data-testid="custom-toolbar">Toolbar Content</div>} />,
    );
    expect(screen.getByTestId('custom-toolbar')).toBeTruthy();
    expect(screen.getByText('Toolbar Content')).toBeTruthy();
  });

  it('renders toolbar alongside filter input', () => {
    render(
      <DataTable
        data={data}
        columns={columns}
        enableFiltering
        toolbar={<div data-testid="custom-toolbar">Actions</div>}
      />,
    );
    expect(screen.getByTestId('custom-toolbar')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('fires onSelectionChange when row selection changes', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataTable
        data={data}
        columns={columns}
        enableRowSelection
        onSelectionChange={onSelectionChange}
        getRowId={(row) => row.id}
      />,
    );
    // The first checkbox is "Select all", subsequent are row checkboxes
    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    expect(checkboxes.length).toBe(3); // 1 header + 2 rows
    // Click the first row's checkbox
    fireEvent.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalled();
    // Last call should include the selected row
    const lastCallArgs = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('selects all rows when header checkbox is clicked', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataTable
        data={data}
        columns={columns}
        enableRowSelection
        onSelectionChange={onSelectionChange}
        getRowId={(row) => row.id}
      />,
    );
    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    // Click "Select all" header checkbox
    fireEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenCalled();
    const lastCallArgs = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toHaveLength(2);
  });

  it('adds cursor-pointer class to rows when onRowClick is provided', () => {
    const { container } = render(<DataTable data={data} columns={columns} onRowClick={() => {}} />);
    const tbody = container.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.[0]?.className).toContain('cursor-pointer');
  });

  it('applies custom className', () => {
    const { container } = render(<DataTable data={data} columns={columns} className="my-custom-class" />);
    expect(container.querySelector('.my-custom-class')).toBeTruthy();
  });

  it('displays correct page info for paginated data', () => {
    const largeData = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `User ${i}` }));
    const { container } = render(<DataTable data={largeData} columns={columns} pageSize={10} />);
    expect(container.textContent).toContain('Page 1 of 3');
  });

  it('disables Previous button on first page', () => {
    render(<DataTable data={data} columns={columns} />);
    const prevBtn = screen.getByLabelText('Previous page');
    expect(prevBtn).toBeTruthy();
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows "No results found." when data is empty', () => {
    render(<DataTable data={[]} columns={columns} />);
    expect(screen.getByText('No results found.')).toBeTruthy();
  });

  it('sorts column when header is clicked', () => {
    render(<DataTable data={data} columns={columns} enableSorting />);
    const nameHeader = screen.getByText('Name');
    // Click to sort ascending
    fireEvent.click(nameHeader);
    // Should show sort indicator
    const headerTh = nameHeader.closest('th');
    expect(headerTh?.textContent).toContain('\u2191');

    // Click again to sort descending
    fireEvent.click(nameHeader);
    expect(headerTh?.textContent).toContain('\u2193');
  });

  it('filters rows when global filter is typed', () => {
    render(<DataTable data={data} columns={columns} enableFiltering />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('navigates to next page and back', () => {
    const largeData = Array.from({ length: 15 }, (_, i) => ({ id: String(i), name: `User ${i}` }));
    render(<DataTable data={largeData} columns={columns} pageSize={10} />);

    // Should start on page 1
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();

    // Click Next
    const nextBtn = screen.getByLabelText('Next page');
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();

    // Click Previous
    const prevBtn = screen.getByLabelText('Previous page');
    fireEvent.click(prevBtn);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('shows row count with correct numbers', () => {
    render(<DataTable data={data} columns={columns} showRowCount />);
    const rowCount = screen.getByTestId('row-count');
    expect(rowCount.textContent).toContain('Showing 2 of 2');
  });
});
