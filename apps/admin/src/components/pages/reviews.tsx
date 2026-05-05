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
} from '@typhoon/ui';
import { ClipboardCheckIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
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
  feedbackCount: number;
  negativeFeedbackCount: number;
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
type FeedbackFilter = 'all' | 'has-feedback' | 'has-negative' | 'no-feedback';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'worstScore', label: 'Worst Score' },
  { value: 'newest', label: 'Newest' },
  { value: 'unscored', label: 'Unscored First' },
];

const ANNOTATION_OPTIONS: { value: AnnotationFilter; label: string }[] = [
  { value: 'all', label: 'All Annotations' },
  { value: 'annotated', label: 'Annotated' },
  { value: 'unannotated', label: 'Unannotated' },
];

const FEEDBACK_OPTIONS: { value: FeedbackFilter; label: string }[] = [
  { value: 'all', label: 'All Feedback' },
  { value: 'has-feedback', label: 'Has Feedback' },
  { value: 'has-negative', label: 'Has Negative' },
  { value: 'no-feedback', label: 'No Feedback' },
];

export function ReviewsPage() {
  const navigate = useNavigate();
  const { sortBy, annotationStatus, feedbackStatus, search } = useSearch({ strict: false }) as {
    sortBy: SortBy;
    annotationStatus: AnnotationFilter;
    feedbackStatus: FeedbackFilter;
    search: string | undefined;
  };
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState(search ?? '');

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

  const searchParams = { sortBy, annotationStatus, feedbackStatus, search };

  function updateFilter(updates: Partial<typeof searchParams>) {
    setPage(0);
    navigate({ to: '/reviews', search: { ...searchParams, ...updates }, replace: true });
  }

  function handleSearchSubmit(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    updateFilter({ search: searchInput.trim() || undefined });
  }

  // Client-side filtering for feedback + search (API handles sort + annotation)
  const filteredThreads = useMemo(() => {
    let threads = data?.threads ?? [];

    if (feedbackStatus === 'has-feedback') {
      threads = threads.filter((t) => t.feedbackCount > 0);
    } else if (feedbackStatus === 'has-negative') {
      threads = threads.filter((t) => t.negativeFeedbackCount > 0);
    } else if (feedbackStatus === 'no-feedback') {
      threads = threads.filter((t) => t.feedbackCount === 0);
    }

    if (search) {
      const q = search.toLowerCase();
      threads = threads.filter((t) => t.title?.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    }

    return threads;
  }, [data?.threads, feedbackStatus, search]);

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
        accessorFn: (row) => row.avgScore ?? -1,
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
        accessorFn: (row) => row.minScore ?? -1,
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
        accessorFn: (row) => row.annotationCount,
        header: 'Annotations',
        cell: ({ row }) =>
          row.original.annotationCount > 0 ? (
            <span className="tabular-nums">{row.original.annotationCount}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'feedback',
        accessorFn: (row) => row.feedbackCount,
        header: 'Feedback',
        cell: ({ row }) => {
          const { feedbackCount, negativeFeedbackCount } = row.original;
          if (feedbackCount === 0) return <span className="text-muted-foreground">&mdash;</span>;
          const positiveCount = feedbackCount - negativeFeedbackCount;
          return (
            <span className="flex items-center gap-2 tabular-nums">
              {positiveCount > 0 && (
                <span className="flex items-center gap-0.5 text-emerald-400">
                  <ThumbsUpIcon className="size-3" />
                  {positiveCount}
                </span>
              )}
              {negativeFeedbackCount > 0 && (
                <span className="flex items-center gap-0.5 text-red-400">
                  <ThumbsDownIcon className="size-3" />
                  {negativeFeedbackCount}
                </span>
              )}
            </span>
          );
        },
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
              data={filteredThreads}
              columns={columns}
              pageSize={20}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/reviews/$threadId', params: { threadId: row.id } })}
              showRowCount
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={sortBy} onValueChange={(v) => updateFilter({ sortBy: v as SortBy })}>
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
                  <Select
                    value={annotationStatus}
                    onValueChange={(v) => updateFilter({ annotationStatus: v as AnnotationFilter })}
                  >
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
                  <Select
                    value={feedbackStatus}
                    onValueChange={(v) => updateFilter({ feedbackStatus: v as FeedbackFilter })}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue placeholder="Feedback" />
                    </SelectTrigger>
                    <SelectContent>
                      {FEEDBACK_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="ml-auto h-8 w-[220px] text-sm"
                    placeholder="Search threads..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchSubmit}
                  />
                </div>
              }
            />

            {filteredThreads.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={<ClipboardCheckIcon className="size-8" />}
                  title="No conversations"
                  description={
                    annotationStatus !== 'all' || feedbackStatus !== 'all' || search
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
