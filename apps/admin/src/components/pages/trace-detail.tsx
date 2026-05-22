import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  apiFetch,
  Badge,
  Button,
  EmptyState,
  formatAbsoluteTime,
  Input,
  LoadingSpinner,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeVariant,
} from '@typhoon/ui';
import { ActivityIcon, ChevronRightIcon, ClipboardCheckIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { detailTitle, usePageTitle } from '../../hooks/use-page-title';
import type { Span, TraceDetailResponse } from './trace-detail/shared';
import { buildSpanTree, formatDurationMs, SPAN_CATEGORY_COLORS, SPAN_CATEGORY_LABELS } from './trace-detail/shared';
import { SpanDetailSheet } from './trace-detail/span-detail-sheet';
import { SpanTree } from './trace-detail/span-tree';

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  success: 'success',
  error: 'error',
  partial: 'warning',
};

export function TraceDetailPage() {
  const { traceId } = useParams({ strict: false }) as { traceId: string };
  const navigate = useNavigate();
  const { span: spanParam } = useSearch({ strict: false }) as { span: string | undefined };

  usePageTitle(detailTitle('Traces', traceId.slice(0, 8)));

  const { data, isLoading, error } = useQuery<TraceDetailResponse>({
    queryKey: ['admin-trace', traceId],
    queryFn: () => apiFetch(`/api/v1/admin/traces/${traceId}`),
    enabled: !!traceId,
  });

  // Build span tree from flat list
  const tree = useMemo(() => (data ? buildSpanTree(data.spans) : []), [data]);

  // Compute trace time bounds for waterfall
  const traceStartMs = useMemo(() => {
    if (!data || data.spans.length === 0) return 0;
    return Math.min(...data.spans.map((s) => new Date(s.startedAt).getTime()));
  }, [data]);

  const traceDurationMs = useMemo(() => {
    if (!data || data.spans.length === 0) return 0;
    const starts = data.spans.map((s) => new Date(s.startedAt).getTime());
    const ends = data.spans.filter((s) => s.endedAt).map((s) => new Date(s.endedAt as string).getTime());
    if (ends.length === 0) return 0;
    return Math.max(...ends) - Math.min(...starts);
  }, [data]);

  // Total tokens across all spans
  const totalTokens = useMemo(() => {
    if (!data) return { prompt: 0, completion: 0 };
    return data.spans.reduce(
      (acc, s) => ({
        prompt: acc.prompt + (s.promptTokens ?? 0),
        completion: acc.completion + (s.completionTokens ?? 0),
      }),
      { prompt: 0, completion: 0 },
    );
  }, [data]);

  // Derive selected span from URL param
  const selectedSpan: Span | null = useMemo(
    () => (spanParam && data ? (data.spans.find((s) => s.spanId === spanParam) ?? null) : null),
    [spanParam, data],
  );

  // Filter state (lives here so toolbar is outside the span tree card)
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // All span type categories (always show all six as legend + filter)
  const allCategories = ['agent', 'model', 'tool', 'scorer', 'workflow', 'rag', 'memory', 'other'] as const;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <EmptyState
            icon={<ActivityIcon className="size-8" />}
            title="Trace not found"
            description="This trace may have expired or been deleted."
          />
        )}

        {data && (
          <>
            <PageHeader
              title={
                <span className="flex items-center gap-1.5">
                  <Link to="/traces" className="text-muted-foreground hover:text-foreground transition-colors">
                    Traces
                  </Link>
                  <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
                  {traceId}
                  <StatusBadge variant={STATUS_VARIANT[data.summary.status] ?? 'pending'}>
                    {data.summary.status}
                  </StatusBadge>
                </span>
              }
              description={`${data.summary.spanCount} spans · ${formatAbsoluteTime(data.summary.startedAt)}`}
              actions={
                data.summary.threadId ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/reviews/${data.summary.threadId}`}>
                      <ClipboardCheckIcon className="mr-1.5 size-3.5" />
                      View Review
                    </Link>
                  </Button>
                ) : undefined
              }
            />

            {/* Summary stats */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Duration"
                value={formatDurationMs(data.summary.durationMs)}
                description="Total trace time"
              />
              <StatCard label="Spans" value={String(data.summary.spanCount)} description="Total span count" />
              <StatCard
                label="Prompt Tokens"
                value={totalTokens.prompt > 0 ? totalTokens.prompt.toLocaleString() : '\u2014'}
                description="Input tokens"
              />
              <StatCard
                label="Completion Tokens"
                value={totalTokens.completion > 0 ? totalTokens.completion.toLocaleString() : '\u2014'}
                description="Output tokens"
              />
            </div>

            {/* Filter toolbar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {allCategories.map((cat) => (
                <Badge
                  key={cat}
                  asChild
                  variant={typeFilter === cat ? 'default' : 'outline'}
                  className="hover:bg-accent cursor-pointer gap-1.5 text-xs transition-colors"
                >
                  <button type="button" onClick={() => setTypeFilter(typeFilter === cat ? null : cat)}>
                    <span className={`size-1.5 rounded-full ${SPAN_CATEGORY_COLORS[cat]}`} />
                    {SPAN_CATEGORY_LABELS[cat]}
                  </button>
                </Badge>
              ))}
              <div className="relative ml-auto">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-[220px] pl-8 text-sm"
                />
              </div>
            </div>

            {/* Waterfall span tree */}
            <div className="mt-4">
              {tree.length > 0 ? (
                <SpanTree
                  roots={tree}
                  traceStartMs={traceStartMs}
                  traceDurationMs={traceDurationMs}
                  nameFilter={nameFilter}
                  typeFilter={typeFilter}
                  onSelectSpan={(s: Span) => navigate({ search: { span: s.spanId } as never, replace: true })}
                />
              ) : (
                <EmptyState
                  icon={<ActivityIcon className="size-8" />}
                  title="No spans"
                  description="This trace has no span data."
                />
              )}
            </div>

            {/* Span detail sheet */}
            <SpanDetailSheet
              span={selectedSpan}
              open={selectedSpan !== null}
              onOpenChange={(open) => {
                if (!open) navigate({ search: { span: undefined } as never, replace: true });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
