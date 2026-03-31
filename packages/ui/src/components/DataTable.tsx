import type { ColumnDef, ColumnFiltersState, OnChangeFn, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

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
  /** Additional CSS classes to merge onto the wrapper. */
  className?: string;
}

/**
 * A generic data table component powered by TanStack Table with
 * sorting, global filtering, and pagination support.
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
  className,
}: DataTableProps<TData>): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([]);

  const columnFilters = controlledColumnFilters ?? internalColumnFilters;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: onColumnFiltersChange ?? setInternalColumnFilters,
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

  return (
    <div className={cn('w-full', className)}>
      {(enableFiltering || toolbar) && (
        <div className="mb-4 flex flex-col gap-3">
          {enableFiltering && (
            <Input
              type="text"
              placeholder="Filter..."
              value={globalFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
          )}
          {toolbar}
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
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {enableSorting &&
                      (header.column.getIsSorted() === 'asc'
                        ? ' \u2191'
                        : header.column.getIsSorted() === 'desc'
                          ? ' \u2193'
                          : '')}
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
                  className={cn('hover:bg-accent transition-colors', onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
