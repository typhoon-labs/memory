import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  DataTable,
  EmptyState,
  formatRelativeTime,
  LoadingSpinner,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@typhoon/ui';
import { ClipboardCheckIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ReviewThread {
  id: string;
  resource_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  avgScore: number | null;
  minScore: number | null;
  scoreCount: number;
  annotationCount: number;
}

interface ReviewListResponse {
  threads: ReviewThread[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

type SortBy = 'worstScore' | 'newest' | 'unscored';
type AnnotationFilter = 'all' | 'annotated' | 'unannotated';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'worstScore', label: 'Worst Score' },
  { value: 'newest', label: 'Newest' },
  { value: 'unscored', label: 'Unscored First' },
];

const ANNOTATION_OPTIONS: { value: AnnotationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'annotated', label: 'Annotated' },
  { value: 'unannotated', label: 'Unannotated' },
];

export function ReviewsPage() {
  const navigate = useNavigate();
  const { sortBy, annotationStatus } = useSearch({ strict: false }) as {
    sortBy: SortBy;
    annotationStatus: AnnotationFilter;
  };
  const [page, setPage] = useState(0);

  const queryKey = useMemo(
    () => ['admin-reviews', { page, sortBy, annotationStatus }] as const,
    [page, sortBy, annotationStatus],
  );

  const { data, isLoading } = useQuery<ReviewListResponse>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        perPage: '20',
        sortBy,
        annotationStatus,
      });
      return apiFetch(`/api/v1/admin/reviews?${params}`);
    },
  });

  function setSortBy(next: SortBy) {
    setPage(0);
    navigate({ to: '/reviews', search: { sortBy: next, annotationStatus }, replace: true });
  }

  function setAnnotationFilter(next: AnnotationFilter) {
    setPage(0);
    navigate({ to: '/reviews', search: { sortBy, annotationStatus: next }, replace: true });
  }

  const columns: ColumnDef<ReviewThread, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'updated_at',
        header: 'Date',
        cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.updated_at)}</span>,
      },
      {
        accessorKey: 'title',
        header: 'Thread',
        cell: ({ row }) => (
          <div className="max-w-[300px] truncate font-medium">
            {row.original.title || (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.id.slice(0, 12)}</code>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'message_count',
        header: 'Messages',
        cell: ({ row }) => <span className="tabular-nums">{row.original.message_count}</span>,
      },
      {
        id: 'avgScore',
        header: 'Avg Score',
        cell: ({ row }) =>
          row.original.avgScore !== null ? (
            <span className="tabular-nums">{row.original.avgScore.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'minScore',
        header: 'Worst Score',
        cell: ({ row }) =>
          row.original.minScore !== null ? (
            <span className="tabular-nums">{row.original.minScore.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'annotationCount',
        header: 'Annotations',
        cell: ({ row }) =>
          row.original.annotationCount > 0 ? (
            <span className="tabular-nums">{row.original.annotationCount}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Reviews" description="Browse conversations and review agent response quality" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && data?.threads && (
          <div className="mt-6">
            <DataTable
              data={data.threads}
              columns={columns}
              pageSize={20}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/reviews/$threadId', params: { threadId: row.id } })}
              showRowCount
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={annotationStatus} onValueChange={(v) => setAnnotationFilter(v as AnnotationFilter)}>
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue placeholder="Annotations" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOTATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />

            {data.threads.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={<ClipboardCheckIcon className="size-8" />}
                  title="No conversations"
                  description={
                    annotationStatus !== 'all'
                      ? 'No conversations match the current filters.'
                      : 'Conversations will appear here once users start chatting.'
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
