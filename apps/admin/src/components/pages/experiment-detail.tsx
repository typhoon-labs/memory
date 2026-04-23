import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  DataTable,
  EmptyState,
  formatRelativeTime,
  LoadingSpinner,
  PageHeader,
  SectionLabel,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@typhoon/ui';
import { ChevronRightIcon, FlaskConicalIcon, GitCompareArrowsIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

// ---------- Types ----------

interface Experiment {
  id: string;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  datasetId: string;
  totalItems: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ScoreEntry {
  name: string;
  score: number;
}

interface ExperimentResult {
  id: string;
  index: number;
  input: unknown;
  ground_truth: unknown;
  output: {
    responseText?: string;
    scores?: ScoreEntry[];
  } | null;
  error: { message: string } | string | null;
}

interface ExperimentResultsResponse {
  results: ExperimentResult[];
}

// ---------- Helpers ----------

const STATUS_VARIANT: Record<Experiment['status'], 'pending' | 'info' | 'success' | 'error'> = {
  pending: 'pending',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

/** Extract a human-readable string from an unknown value, truncated to maxLen. */
function truncateValue(value: unknown, maxLen = 60): string {
  if (value == null) return '\u2014';
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Try common field names first
    for (const key of ['question', 'answer', 'text', 'content', 'input', 'output']) {
      if (typeof obj[key] === 'string') {
        const s = obj[key] as string;
        return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
      }
    }
    const json = JSON.stringify(value);
    return json.length > maxLen ? `${json.slice(0, maxLen)}...` : json;
  }
  const s = String(value);
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

/** Format a duration between two ISO date strings. */
function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// ---------- Main Page ----------

export function ExperimentDetailPage() {
  const navigate = useNavigate();
  const { experimentId } = useParams({ strict: false }) as { experimentId: string };
  const queryClient = useQueryClient();
  const [viewingResult, setViewingResult] = useState<ExperimentResult | null>(null);

  const { data: experiment, isLoading: experimentLoading } = useQuery<Experiment>({
    queryKey: ['admin-experiment', experimentId],
    queryFn: () => apiFetch(`/api/v1/admin/experiments/${experimentId}`),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
  });

  const { data: resultsData, isLoading: resultsLoading } = useQuery<ExperimentResultsResponse>({
    queryKey: ['admin-experiment-results', experimentId],
    queryFn: () => apiFetch(`/api/v1/admin/experiments/${experimentId}/results`),
    refetchInterval: () => (experiment?.status === 'running' ? 3000 : false),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/admin/experiments/${experimentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-experiment', experimentId] });
      queryClient.invalidateQueries({ queryKey: ['admin-experiment-results', experimentId] });
    },
  });

  const results = resultsData?.results ?? [];
  const isRunning = experiment?.status === 'running';
  const processed = (experiment?.succeeded ?? 0) + (experiment?.failed ?? 0);
  const total = experiment?.totalItems ?? 0;
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;

  const columns: ColumnDef<ExperimentResult, unknown>[] = useMemo(
    () => [
      {
        id: 'index',
        header: '#',
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.index + 1}</span>,
      },
      {
        id: 'input',
        header: 'Input',
        cell: ({ row }) => <div className="max-w-[160px] truncate text-sm">{truncateValue(row.original.input)}</div>,
      },
      {
        id: 'expected',
        header: 'Expected',
        cell: ({ row }) => (
          <div className="max-w-[160px] truncate text-sm text-muted-foreground">
            {truncateValue(row.original.ground_truth)}
          </div>
        ),
      },
      {
        id: 'actual',
        header: 'Actual',
        cell: ({ row }) => (
          <div className="max-w-[160px] truncate text-sm">{truncateValue(row.original.output?.responseText)}</div>
        ),
      },
      {
        id: 'scores',
        header: 'Scores',
        cell: ({ row }) => {
          const scores = row.original.output?.scores;
          if (!scores || scores.length === 0) {
            return <span className="text-muted-foreground">&mdash;</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {scores.map((s) => (
                <span key={s.name} className="tabular-nums text-sm">
                  {s.score != null ? s.score.toFixed(2) : '\u2014'}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: 'error',
        header: 'Error',
        cell: ({ row }) => (row.original.error ? <StatusBadge variant="error">Error</StatusBadge> : null),
      },
    ],
    [],
  );

  if (experimentLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-5xl">
          <EmptyState
            icon={<FlaskConicalIcon className="size-8" />}
            title="Experiment not found"
            description="The experiment you are looking for does not exist."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <a
                href="/experiments"
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ to: '/experiments' });
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Experiments
              </a>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              {experiment.name || `Experiment ${experiment.id.slice(0, 8)}`}
            </span>
          }
          description={`Created ${formatRelativeTime(experiment.createdAt)}`}
          actions={<StatusBadge variant={STATUS_VARIANT[experiment.status]}>{experiment.status}</StatusBadge>}
        />

        {/* Summary section */}
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-6">
            {/* Progress */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Progress</p>
              <p className="mt-1 text-sm font-medium">
                {processed} / {total} items processed
              </p>
            </div>

            {/* Duration */}
            {experiment.startedAt && experiment.completedAt && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Duration</p>
                <p className="mt-1 text-sm font-medium">
                  {formatDuration(experiment.startedAt, experiment.completedAt)}
                </p>
              </div>
            )}

            {/* Succeeded / Failed breakdown */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Results</p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <span>{experiment.succeeded ?? 0} passed</span>
                {(experiment.failed ?? 0) > 0 && (
                  <span className="text-muted-foreground">{experiment.failed} failed</span>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="ml-auto flex items-center gap-2">
              {isRunning && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  <XIcon className="mr-1.5 size-3.5" />
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
                </Button>
              )}
              {experiment.status === 'completed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate({
                      to: '/experiments/compare',
                      search: { a: experiment.id },
                    })
                  }
                >
                  <GitCompareArrowsIcon className="mr-1.5 size-3.5" />
                  Compare
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar when running */}
          {isRunning && (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>

        {/* Results table */}
        <div className="mt-6">
          {resultsLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {!resultsLoading && results.length > 0 && (
            <DataTable
              data={results}
              columns={columns}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={setViewingResult}
              showRowCount
            />
          )}

          {!resultsLoading && results.length === 0 && !isRunning && (
            <EmptyState
              icon={<FlaskConicalIcon className="size-8" />}
              title="No results yet"
              description="Results will appear here once the experiment processes items."
            />
          )}

          {!resultsLoading && results.length === 0 && isRunning && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Processing items... results will appear shortly.
            </div>
          )}
        </div>

        {viewingResult && (
          <Sheet open={!!viewingResult} onOpenChange={(open) => !open && setViewingResult(null)}>
            <SheetContent className="overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
              <SheetHeader>
                <SheetTitle>Result #{results.indexOf(viewingResult) + 1}</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-4">
                <div>
                  <SectionLabel>Input</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {truncateValue(viewingResult.input, 2000)}
                  </p>
                </div>
                <div>
                  <SectionLabel>Expected Output</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {truncateValue(viewingResult.ground_truth, 2000)}
                  </p>
                </div>
                <div>
                  <SectionLabel>Actual Response</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {truncateValue(viewingResult.output?.responseText, 2000)}
                  </p>
                </div>
                {viewingResult.output?.scores && viewingResult.output.scores.length > 0 && (
                  <div>
                    <SectionLabel>Scores</SectionLabel>
                    <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
                      {viewingResult.output.scores.map((s) => (
                        <div key={s.name}>
                          <dt className="text-muted-foreground">{s.name}</dt>
                          <dd className="mt-0.5 tabular-nums">{s.score != null ? s.score.toFixed(3) : '\u2014'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {viewingResult.error && (
                  <div>
                    <SectionLabel>Error</SectionLabel>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-red-400">
                      {typeof viewingResult.error === 'string' ? viewingResult.error : viewingResult.error?.message}
                    </p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
