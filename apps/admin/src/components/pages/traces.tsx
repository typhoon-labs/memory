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
} from '@typhoon/ui';
import { ActivityIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

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

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  success: 'success',
  error: 'error',
  partial: 'warning',
};

const SPAN_TYPE_LABELS: Record<string, string> = {
  agent_run: 'Agent',
  model_generation: 'Model',
  model_step: 'Model Step',
  tool_call: 'Tool',
  mcp_tool_call: 'MCP Tool',
  scorer_run: 'Scorer',
  workflow_run: 'Workflow',
  generic: 'Generic',
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

  const statusFilter = searchParams.status ?? 'all';
  const searchFilter = searchParams.search ?? '';
  const threadIdFilter = searchParams.threadId;
  const [searchInput, setSearchInput] = useState(searchFilter);

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

  function handleSearchSubmit() {
    navigate({
      to: '/traces',
      search: { ...searchParams, search: searchInput || undefined },
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
        id: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {SPAN_TYPE_LABELS[row.original.rootSpanType] ?? row.original.rootSpanType}
          </span>
        ),
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
                  <div className="ml-auto">
                    <Input
                      placeholder="Search traces..."
                      className="h-8 w-[220px] text-sm"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
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
