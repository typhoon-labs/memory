import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  cn,
  DataTable,
  DocumentContentViewer,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@typhoon/ui';
import { ChevronRightIcon, FlaskConicalIcon, GitCompareArrowsIcon, InfoIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// ---------- Types ----------

interface Experiment {
  id: string;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  datasetId: string;
  totalItems: number;
  succeededCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ScoreEntry {
  scorerId: string;
  name?: string;
  score: number;
  reason?: string;
}

interface ExperimentResult {
  id: string;
  itemId: string;
  input: unknown;
  groundTruth: unknown;
  output: {
    responseText?: string;
    scores?: ScoreEntry[];
  } | null;
  error: { message: string } | string | null;
}

interface ExperimentResultsResponse {
  results: ExperimentResult[];
}

interface Scorer {
  id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  status: string;
}

interface ScorersResponse {
  scorers: Scorer[];
  total: number;
}

// ---------- Helpers ----------

const STATUS_VARIANT: Record<Experiment['status'], 'pending' | 'info' | 'success' | 'error'> = {
  pending: 'pending',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

function truncateValue(value: unknown, maxLen = 60): string {
  if (value == null) return '\u2014';
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
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

function formatScorerId(id: string): string {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function scoreDotClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-400/60';
  if (score >= 0.4) return 'bg-amber-400/60';
  return 'bg-red-400/60';
}

function avgScore(result: ExperimentResult): number | null {
  const scores = result.output?.scores;
  if (!scores || scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}

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

// ---------- Sub-components ----------

function ScorerTooltip({ description }: { description: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InfoIcon className="ml-1 inline size-3 text-muted-foreground/60 hover:text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{description}</TooltipContent>
    </Tooltip>
  );
}

function ResultDetailSheet({
  result,
  open,
  onOpenChange,
  scorerDescriptions,
}: {
  result: ExperimentResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scorerDescriptions: Record<string, string>;
}) {
  const scores = result?.output?.scores ?? [];
  const [selectedScorer, setSelectedScorer] = useState<string | undefined>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when result ID changes
  useEffect(() => {
    setSelectedScorer(undefined);
  }, [result?.id]);

  const effectiveScorer =
    selectedScorer ??
    scores.reduce((lowest: ScoreEntry | undefined, s) => (!lowest || s.score < lowest.score ? s : lowest), undefined)
      ?.scorerId;

  const activeScore = scores.find((s) => s.scorerId === effectiveScorer);

  if (!result) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        resizable
        className="overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="text-base">{truncateValue(result.input, 80)}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="details" className="px-4 pb-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="scores" disabled={scores.length === 0}>
              Scores ({scores.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <div className="space-y-5">
              <div>
                <SectionLabel>Input</SectionLabel>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{truncateValue(result.input, 2000)}</p>
              </div>

              {result.groundTruth != null && (
                <div>
                  <SectionLabel>Expected</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {truncateValue(result.groundTruth, 2000)}
                  </p>
                </div>
              )}

              <div>
                <SectionLabel>Response</SectionLabel>
                <div className="mt-2 text-sm leading-relaxed">
                  {result.output?.responseText ? (
                    <DocumentContentViewer text={result.output.responseText} mimeType="text/markdown" />
                  ) : (
                    <span className="text-muted-foreground">{'\u2014'}</span>
                  )}
                </div>
              </div>

              {result.error && (
                <div>
                  <SectionLabel>Error</SectionLabel>
                  <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    <p className="whitespace-pre-wrap">
                      {typeof result.error === 'string' ? result.error : result.error.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scores" className="mt-4">
            <TooltipProvider delayDuration={200}>
              <div className="flex flex-col">
                {scores.map((s) => (
                  <button
                    key={s.scorerId}
                    type="button"
                    onClick={() => setSelectedScorer(s.scorerId)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-xs transition-colors',
                      effectiveScorer === s.scorerId ? 'bg-muted/50' : 'hover:bg-muted/30',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={cn('size-2 shrink-0 rounded-full', scoreDotClass(s.score))} />
                      <span className={cn(effectiveScorer === s.scorerId && 'font-semibold')}>
                        {formatScorerId(s.scorerId)}
                      </span>
                      {scorerDescriptions[s.scorerId] && <ScorerTooltip description={scorerDescriptions[s.scorerId]} />}
                    </span>
                    <span className={cn('tabular-nums', effectiveScorer === s.scorerId && 'font-semibold')}>
                      {s.score.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </TooltipProvider>

            {activeScore?.reason ? (
              <>
                <hr className="my-3 border-border" />
                <div className="text-sm leading-relaxed">
                  <DocumentContentViewer text={activeScore.reason} mimeType="text/markdown" />
                </div>
              </>
            ) : (
              activeScore && (
                <>
                  <hr className="my-3 border-border" />
                  <p className="text-sm text-muted-foreground">No reasoning provided for this scorer.</p>
                </>
              )
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Main Page ----------

export function ExperimentDetailPage() {
  const navigate = useNavigate();
  const { experimentId } = useParams({ strict: false }) as { experimentId: string };
  const queryClient = useQueryClient();
  const { result: resultId } = useSearch({ strict: false }) as { result?: string };

  const [selectedResult, setSelectedResult] = useState<ExperimentResult | null>(null);

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

  const { data: scorersData } = useQuery<ScorersResponse>({
    queryKey: ['admin-scorers'],
    queryFn: () => apiFetch('/api/v1/admin/scorers'),
    staleTime: 5 * 60 * 1000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/admin/experiments/${experimentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-experiment', experimentId] });
      queryClient.invalidateQueries({ queryKey: ['admin-experiment-results', experimentId] });
    },
  });

  const results = resultsData?.results ?? [];

  const scorerDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of scorersData?.scorers ?? []) {
      if (s.name && s.description) map[s.name] = s.description;
    }
    return map;
  }, [scorersData]);

  // Deep link: open result from URL param
  useEffect(() => {
    if (resultId && results.length > 0 && !selectedResult) {
      const match = results.find((r) => r.id === resultId);
      if (match) setSelectedResult(match);
    }
  }, [resultId, results, selectedResult]);

  const columns: ColumnDef<ExperimentResult, unknown>[] = useMemo(
    () => [
      {
        id: 'input',
        accessorFn: (row) => truncateValue(row.input, 9999),
        header: 'Input',
        cell: ({ row }) => {
          const avg = avgScore(row.original);
          return (
            <div className="flex items-center gap-2">
              <span className={cn('size-2 shrink-0 rounded-full', scoreDotClass(avg ?? -1))} />
              <span className="truncate text-sm">{truncateValue(row.original.input, 120)}</span>
            </div>
          );
        },
      },
      {
        id: 'response',
        accessorFn: (row) => truncateValue(row.output?.responseText, 9999),
        header: 'Response',
        cell: ({ row }) => (
          <div className="max-w-[400px] truncate text-sm text-muted-foreground">
            {truncateValue(row.original.output?.responseText, 200)}
          </div>
        ),
      },
      {
        id: 'avg',
        accessorFn: (row) => avgScore(row) ?? -1,
        header: 'Average',
        cell: ({ row }) => {
          const avg = avgScore(row.original);
          return <span className="tabular-nums text-sm">{avg != null ? avg.toFixed(2) : '\u2014'}</span>;
        },
      },
    ],
    [],
  );

  const isRunning = experiment?.status === 'running';
  const processed = (experiment?.succeededCount ?? 0) + (experiment?.failedCount ?? 0);
  const total = experiment?.totalItems ?? 0;
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;

  const descParts: string[] = [];
  if (experiment) {
    descParts.push(`${processed}/${total} items`);
    if ((experiment.succeededCount ?? 0) > 0 || (experiment.failedCount ?? 0) > 0) {
      const parts = [];
      if (experiment.succeededCount) parts.push(`${experiment.succeededCount} passed`);
      if (experiment.failedCount) parts.push(`${experiment.failedCount} failed`);
      descParts.push(parts.join(', '));
    }
    if (experiment.startedAt && experiment.completedAt) {
      descParts.push(formatDuration(experiment.startedAt, experiment.completedAt));
    }
    descParts.push(`Created ${formatRelativeTime(experiment.createdAt)}`);
  }

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
              <StatusBadge variant={STATUS_VARIANT[experiment.status]} className="ml-1.5">
                {experiment.status}
              </StatusBadge>
            </span>
          }
          description={descParts.join(' \u00B7 ')}
          actions={
            <>
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
                  onClick={() => navigate({ to: '/experiments/compare', search: { a: experiment.id } })}
                >
                  <GitCompareArrowsIcon className="mr-1.5 size-3.5" />
                  Compare
                </Button>
              )}
            </>
          }
        />

        {isRunning && (
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        )}

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
              enableFiltering
              showRowCount
              pageSize={25}
              getRowId={(row) => row.id}
              onRowClick={setSelectedResult}
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

        <ResultDetailSheet
          result={selectedResult}
          open={selectedResult !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedResult(null);
          }}
          scorerDescriptions={scorerDescriptions}
        />
      </div>
    </div>
  );
}
