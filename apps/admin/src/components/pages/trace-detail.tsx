import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  EmptyState,
  formatAbsoluteTime,
  LoadingSpinner,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeVariant,
} from '@typhoon/ui';
import { ActivityIcon, ChevronRightIcon, ClipboardCheckIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Span, TraceDetailResponse } from './trace-detail/shared';
import { buildSpanTree, formatDurationMs } from './trace-detail/shared';
import { SpanDetailSheet } from './trace-detail/span-detail-sheet';
import { SpanTree } from './trace-detail/span-tree';

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  success: 'success',
  error: 'error',
  partial: 'warning',
};

export function TraceDetailPage() {
  const { traceId } = useParams({ strict: false }) as { traceId: string };
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

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
    const ends = data.spans.filter((s) => s.endedAt).map((s) => new Date(s.endedAt!).getTime());
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
                  <a href="/traces" className="text-muted-foreground transition-colors hover:text-foreground">
                    Traces
                  </a>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
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
                    <a href={`/reviews/${data.summary.threadId}`}>
                      <ClipboardCheckIcon className="mr-1.5 size-3.5" />
                      View Review
                    </a>
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

            {/* Span type legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <LegendDot color="bg-blue-400/60" label="Agent" />
              <LegendDot color="bg-purple-400/60" label="Model" />
              <LegendDot color="bg-amber-400/60" label="Tool" />
              <LegendDot color="bg-emerald-400/60" label="Scorer" />
              <LegendDot color="bg-cyan-400/60" label="Workflow" />
              <LegendDot color="bg-zinc-400/60" label="Other" />
            </div>

            {/* Waterfall span tree */}
            <div className="mt-4">
              {tree.length > 0 ? (
                <SpanTree
                  roots={tree}
                  traceStartMs={traceStartMs}
                  traceDurationMs={traceDurationMs}
                  onSelectSpan={setSelectedSpan}
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
                if (!open) setSelectedSpan(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
