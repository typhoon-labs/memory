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
  useUrlSearchInput,
} from '@typhoon/ui';
import { ClipboardCheckIcon, SearchIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useMemo } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

interface ReviewThread {
  id: string;
  resource_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  responseAvg: number | null;
  retrievalAvg: number | null;
  scoreCount: number;
  annotationCount: number;
  feedbackCount: number;
  negativeFeedbackCount: number;
}

interface ReviewListResponse {
  threads: ReviewThread[];
  total: number;
}

type SortBy = 'responseScore' | 'retrievalScore' | 'newest' | 'unscored';
type AnnotationFilter = 'all' | 'annotated' | 'unannotated';
type FeedbackFilter = 'all' | 'has-feedback' | 'has-negative' | 'no-feedback';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'responseScore', label: 'Response Quality' },
  { value: 'retrievalScore', label: 'Retrieval Quality' },
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
  usePageTitle('Reviews');

  const {
    inputValue: searchInput,
    setInputValue: setSearchInput,
    handleKeyDown: searchKeyDown,
    handleBlur: searchBlur,
  } = useUrlSearchInput({
    urlValue: search,
    onCommit: (val) =>
      navigate({
        to: '/reviews',
        search: { sortBy, annotationStatus, feedbackStatus, search: val },
        replace: true,
      }),
  });

  const queryKey = useMemo(() => ['admin-reviews', { sortBy, annotationStatus }] as const, [sortBy, annotationStatus]);

  const { data, isLoading } = useQuery<ReviewListResponse>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ sortBy, annotationStatus });
      return apiFetch(`/api/v1/admin/reviews?${params}`);
    },
  });

  const searchParams = { sortBy, annotationStatus, feedbackStatus, search };

  function updateFilter(updates: Partial<typeof searchParams>) {
    navigate({ to: '/reviews', search: { ...searchParams, ...updates }, replace: true });
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
        id: 'responseAvg',
        accessorFn: (row) => row.responseAvg ?? -1,
        header: 'Response',
        cell: ({ row }) =>
          row.original.responseAvg !== null ? (
            <span className="tabular-nums">{row.original.responseAvg.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'retrievalAvg',
        accessorFn: (row) => row.retrievalAvg ?? -1,
        header: 'Retrieval',
        cell: ({ row }) =>
          row.original.retrievalAvg !== null ? (
            <span className="tabular-nums">{row.original.retrievalAvg.toFixed(2)}</span>
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
              pageSize={25}
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
                  <div className="relative ml-auto">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 w-[220px] pl-8 text-sm"
                      placeholder="Search..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={searchKeyDown}
                      onBlur={searchBlur}
                    />
                  </div>
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
