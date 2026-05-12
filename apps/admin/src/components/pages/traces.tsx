import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  DataTable,
  EmptyState,
  formatRelativeTime,
  Input,
  LoadingSpinner,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  type StatusBadgeVariant,
  useUrlSearchInput,
} from '@typhoon/ui';
import { ActivityIcon, SearchIcon } from 'lucide-react';
import { useMemo } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';
import { formatDurationMs } from './trace-detail/shared';

// ---------- Types ----------

interface TraceListItem {
  traceId: string;
  rootSpanName: string;
  rootSpanType: string;
  rootEntityType: string | null;
  rootEntityName: string | null;
  threadId: string | null;
  serviceName: string | null;
  status: 'success' | 'error' | 'partial';
  spanCount: number;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface TraceListResponse {
  traces: TraceListItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

type StatusFilter = 'all' | 'success' | 'error' | 'partial';

// ---------- Helpers ----------

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  success: 'success',
  error: 'error',
  partial: 'warning',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'partial', label: 'Partial' },
];

// ---------- Main Page ----------

export function TracesPage() {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as {
    status?: StatusFilter;
    entityType?: string;
    search?: string;
    threadId?: string;
  };
  usePageTitle('Traces');

  const statusFilter = searchParams.status ?? 'all';
  const searchFilter = searchParams.search ?? '';
  const threadIdFilter = searchParams.threadId;

  const {
    inputValue: searchInput,
    setInputValue: setSearchInput,
    handleKeyDown: searchKeyDown,
    handleBlur: searchBlur,
  } = useUrlSearchInput({
    urlValue: searchParams.search,
    onCommit: (val) => navigate({ to: '/traces', search: { ...searchParams, search: val }, replace: true }),
  });

  const queryKey = useMemo(
    () => ['admin-traces', { status: statusFilter, search: searchFilter, threadId: threadIdFilter }] as const,
    [statusFilter, searchFilter, threadIdFilter],
  );

  const { data, isLoading } = useQuery<TraceListResponse>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ perPage: '200' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchFilter) params.set('search', searchFilter);
      if (threadIdFilter) params.set('threadId', threadIdFilter);
      return apiFetch(`/api/v1/admin/traces?${params}`);
    },
  });

  function handleStatusChange(value: string) {
    navigate({
      to: '/traces',
      search: { ...searchParams, status: value === 'all' ? undefined : value },
      replace: true,
    });
  }

  const columns: ColumnDef<TraceListItem, unknown>[] = useMemo(
    () => [
      {
        id: 'time',
        header: 'Time',
        cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.startedAt)}</span>,
      },
      {
        id: 'trace',
        header: 'Trace ID',
        cell: ({ row }) => <span className="font-medium">{row.original.traceId}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'pending'}>{row.original.status}</StatusBadge>
        ),
      },
      {
        id: 'spans',
        header: 'Spans',
        cell: ({ row }) => <span className="tabular-nums">{row.original.spanCount}</span>,
      },
      {
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{formatDurationMs(row.original.durationMs)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Traces" description="Browse and inspect agent execution traces" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && data && data.traces.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<ActivityIcon className="size-8" />}
              title="No traces found"
              description="Traces will appear here as agent conversations occur."
            />
          </div>
        )}

        {!isLoading && data && data.traces.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={data.traces}
              columns={columns}
              pageSize={50}
              enableSorting
              getRowId={(row) => row.traceId}
              onRowClick={(row) => navigate({ to: `/traces/${row.traceId}` })}
              showRowCount
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={handleStatusChange}>
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative ml-auto">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="h-8 w-[220px] pl-8 text-sm"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={searchKeyDown}
                      onBlur={searchBlur}
                    />
                  </div>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
