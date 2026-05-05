import type { ColumnDef, ColumnFiltersState, OnChangeFn, RowSelectionState, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';

export interface DataTableProps<TData> {
  /** The array of data rows to display. */
  data: TData[];
  /** Column definitions from @tanstack/react-table. */
  columns: ColumnDef<TData, unknown>[];
  /** Number of rows per page. Defaults to 10. */
  pageSize?: number;
  /** Enable column sorting on header click. Defaults to true. */
  enableSorting?: boolean;
  /** Enable a global text filter input. Defaults to false. */
  enableFiltering?: boolean;
  /** Column-level filter state managed externally. */
  columnFilters?: ColumnFiltersState;
  /** Callback when column filters change. */
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  /** Slot rendered between the filter input and the table. */
  toolbar?: React.ReactNode;
  /** Show "Showing X of Y" row count below the table. */
  showRowCount?: boolean;
  /** Callback when a table row is clicked. Receives the row's original data. */
  onRowClick?: (row: TData) => void;
  /** Callback when a table row is hovered. Useful for prefetching data. */
  onRowHover?: (row: TData) => void;
  /** Enable row selection with checkboxes. Defaults to false. */
  enableRowSelection?: boolean;
  /** Callback when selection changes. Receives array of selected row data. */
  onSelectionChange?: (selected: TData[]) => void;
  /** Function to derive a unique row ID from data. Required when enableRowSelection is true. */
  getRowId?: (row: TData) => string;
  /** Additional CSS classes to merge onto the wrapper. */
  className?: string;
}

/**
 * A generic data table component powered by TanStack Table with
 * sorting, global filtering, pagination, and optional row selection.
 */
export function DataTable<TData>({
  data,
  columns,
  pageSize = 10,
  enableSorting = true,
  enableFiltering = false,
  columnFilters: controlledColumnFilters,
  onColumnFiltersChange,
  toolbar,
  showRowCount = false,
  onRowClick,
  onRowHover,
  enableRowSelection = false,
  onSelectionChange,
  getRowId,
  className,
}: DataTableProps<TData>): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columnFilters = controlledColumnFilters ?? internalColumnFilters;

  // Prepend a checkbox column when row selection is enabled
  const allColumns = useMemo(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: '_select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      ...(enableRowSelection ? { rowSelection } : {}),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: onColumnFiltersChange ?? setInternalColumnFilters,
    ...(enableRowSelection
      ? {
          enableRowSelection: true,
          onRowSelectionChange: setRowSelection,
          getRowId,
        }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // Notify parent of selection changes — rowSelection is an intentional trigger dependency
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowSelection triggers re-computation of selected rows
  useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(selected);
  }, [rowSelection, enableRowSelection, onSelectionChange, table]);

  return (
    <div className={cn('w-full', className)}>
      {(enableFiltering || toolbar) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {toolbar && <div className="flex-1">{toolbar}</div>}
          {enableFiltering && (
            <Input
              type="text"
              placeholder="Filter..."
              value={globalFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalFilter(e.target.value)}
              className="ml-auto h-8 w-[220px] text-sm"
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-widest text-muted-foreground',
                      enableSorting && header.column.getCanSort() && 'cursor-pointer select-none',
                      header.id === '_select' && 'w-10',
                    )}
                    onClick={enableSorting ? header.column.getToggleSortingHandler() : undefined}
                    onKeyDown={
                      enableSorting
                        ? (e: React.KeyboardEvent<HTMLTableCellElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {enableSorting && header.column.getCanSort() && (
                        <span className="inline-block w-3 text-center">
                          {header.column.getIsSorted() === 'asc'
                            ? '\u2191'
                            : header.column.getIsSorted() === 'desc'
                              ? '\u2193'
                              : ''}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-accent transition-colors',
                    onRowClick && 'cursor-pointer',
                    enableRowSelection && row.getIsSelected() && 'bg-muted/50',
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onMouseEnter={onRowHover ? () => onRowHover(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-2.5 align-middle text-sm text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={allColumns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          {showRowCount && (
            <span className="text-xs text-muted-foreground" data-testid="row-count">
              Showing {table.getRowModel().rows.length} of {data.length}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
