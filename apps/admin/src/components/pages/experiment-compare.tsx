import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { computeCategoryAverages, normalizeScoreForAvg, SCORER_CATEGORIES } from '@typhoon/evals/scorer-categories';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  cn,
  DataTable,
  EmptyState,
  LoadingSpinner,
  MarkdownContent,
  PageHeader,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@typhoon/ui';
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GitCompareArrowsIcon,
  InfoIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { detailTitle, usePageTitle } from '../../hooks/use-page-title';
import { type SourceEntry, ResponseWithCitations } from '../shared/response-with-citations';

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
}

interface ExperimentListResponse {
  experiments: Experiment[];
  total: number;
}

interface ScoreEntry {
  scorerId?: string;
  name?: string;
  score: number | null;
  reason?: string;
  status?: 'skipped';
}

interface ResultDetail {
  responseText?: string;
  scores?: ScoreEntry[];
  sources?: SourceEntry[];
}

interface ComparisonItem {
  index: number;
  input: unknown;
  groundTruth: unknown;
  scoreA: number | null;
  scoreB: number | null;
  delta: number | null;
  resultA: ResultDetail | null;
  resultB: ResultDetail | null;
}

interface ComparisonResponse {
  experimentA: { id: string; name: string | null; avgScore: number | null };
  experimentB: { id: string; name: string | null; avgScore: number | null };
  items: ComparisonItem[];
  summary: {
    improvements: number;
    regressions: number;
    unchanged: number;
  };
}

/** Raw shape returned by the compare API endpoint before UI transformation. */
interface CompareApiResponse {
  experimentA?: { id: string; name: string | null };
  experimentB?: { id: string; name: string | null };
  aggregate?: {
    avgScoreA: number | null;
    avgScoreB: number | null;
    improvementCount: number;
    regressionCount: number;
  };
  items?: Array<Record<string, unknown>>;
}

interface ScorersResponse {
  scorers: Array<{ name: string | null; description: string | null }>;
}

// ---------- Helpers ----------

/** Extract a human-readable string from an unknown value, truncated to maxLen. */
function truncateValue(value: unknown, maxLen = 60): string {
  if (value === null || value === undefined) return '\u2014';
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

/** Extract response quality average from experiment result output JSONB. */
function extractResultScore(result: Record<string, unknown> | null): number | null {
  if (!result?.output) return null;
  const output = result.output as Record<string, unknown>;
  const scores = output.scores as Array<{ scorerId: string; score: number | null; status?: string }> | undefined;
  if (!scores || scores.length === 0) return null;
  return computeCategoryAverages(scores).responseAvg;
}

function scoreDotClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-400/60';
  if (score >= 0.4) return 'bg-amber-400/60';
  return 'bg-red-400/60';
}

function DeltaIndicator({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-muted-foreground">&mdash;</span>;
  const rounded = Math.round(delta * 100) / 100;
  if (rounded > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-emerald-400">
        <ArrowUpIcon className="size-3.5" />+{rounded.toFixed(2)}
      </span>
    );
  }
  if (rounded < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-red-400">
        <ArrowDownIcon className="size-3.5" />
        {rounded.toFixed(2)}
      </span>
    );
  }
  return <span className="text-muted-foreground text-sm">0.00</span>;
}

// ---------- Score Breakdown ----------

function formatScorerId(id: string): string {
  return id
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function normalizedDotClass(scorerId: string, rawScore: number): string {
  return scoreDotClass(normalizeScoreForAvg(scorerId, rawScore));
}

function ScoreBreakdown({ scoresA, scoresB }: { scoresA: ScoreEntry[]; scoresB: ScoreEntry[] }) {
  const allScorerIds = useMemo(
    () => [
      ...new Set([
        ...scoresA.map((s) => s.scorerId ?? s.name ?? 'unknown'),
        ...scoresB.map((s) => s.scorerId ?? s.name ?? 'unknown'),
      ]),
    ],
    [scoresA, scoresB],
  );

  // Group by category (matching experiment-detail and review-detail)
  const responseIds = allScorerIds.filter((id) => SCORER_CATEGORIES[id]?.category === 'response');
  const retrievalIds = allScorerIds.filter((id) => SCORER_CATEGORIES[id]?.category === 'retrieval');
  const otherIds = allScorerIds.filter((id) => !SCORER_CATEGORIES[id]);

  const avgsA = computeCategoryAverages(scoresA.map((s) => ({ scorerId: s.scorerId ?? s.name ?? '', score: s.score })));
  const avgsB = computeCategoryAverages(scoresB.map((s) => ({ scorerId: s.scorerId ?? s.name ?? '', score: s.score })));

  const [selectedScorer, setSelectedScorer] = useState<string | undefined>();
  const effectiveScorer = selectedScorer ?? allScorerIds[0];

  const activeA = scoresA.find((s) => (s.scorerId ?? s.name ?? 'unknown') === effectiveScorer);
  const activeB = scoresB.find((s) => (s.scorerId ?? s.name ?? 'unknown') === effectiveScorer);

  const { data: scorersData } = useQuery<ScorersResponse>({
    queryKey: ['admin-scorers'],
    queryFn: () => apiFetch('/api/v1/admin/scorers'),
    staleTime: 5 * 60 * 1000,
  });

  const scorerDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of scorersData?.scorers ?? []) {
      if (s.name && s.description) map[s.name] = s.description;
    }
    return map;
  }, [scorersData]);

  function renderScoreRow(sid: string, scores: ScoreEntry[]) {
    const s = scores.find((sc) => (sc.scorerId ?? sc.name ?? 'unknown') === sid);
    return (
      <button
        key={sid}
        type="button"
        onClick={() => setSelectedScorer(sid)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-xs transition-colors',
          effectiveScorer === sid ? 'bg-muted' : 'hover:bg-muted',
        )}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              s && s.score !== null && s.status !== 'skipped'
                ? normalizedDotClass(sid, s.score)
                : 'bg-muted-foreground/30',
            )}
          />
          <span>{formatScorerId(sid)}</span>
          {scorerDescriptions[sid] && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="text-muted-foreground/60 hover:text-muted-foreground size-3" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{scorerDescriptions[sid]}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="tabular-nums">
          {s ? (s.status === 'skipped' ? 'N/A' : s.score !== null ? s.score.toFixed(2) : '\u2014') : '\u2014'}
        </span>
      </button>
    );
  }

  function renderCategory(label: string, ids: string[], avgA: number | null, avgB: number | null) {
    if (ids.length === 0) return null;
    return (
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">{label}</span>
        </div>
        <div className="sm:divide-border grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x">
          <div className="sm:pr-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted-foreground text-[10px]">Baseline</span>
              {avgA !== null && (
                <span className="text-muted-foreground flex items-center gap-1 text-[10px] font-bold tabular-nums">
                  <span className={cn('size-1.5 rounded-full', scoreDotClass(avgA))} />
                  {avgA.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-px">{ids.map((sid) => renderScoreRow(sid, scoresA))}</div>
          </div>
          <div className="sm:pl-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted-foreground text-[10px]">Candidate</span>
              {avgB !== null && (
                <span className="text-muted-foreground flex items-center gap-1 text-[10px] font-bold tabular-nums">
                  <span className={cn('size-1.5 rounded-full', scoreDotClass(avgB))} />
                  {avgB.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-px">{ids.map((sid) => renderScoreRow(sid, scoresB))}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Score Breakdown</SectionLabel>
      <TooltipProvider delayDuration={200}>
        <div className="mt-2">
          {renderCategory('Response Quality', responseIds, avgsA.responseAvg, avgsB.responseAvg)}
          {renderCategory('Retrieval Quality', retrievalIds, avgsA.retrievalAvg, avgsB.retrievalAvg)}
          {otherIds.length > 0 && renderCategory('Other', otherIds, null, null)}
        </div>
      </TooltipProvider>

      {/* Selected scorer reason */}
      {activeA?.reason || activeB?.reason ? (
        <>
          <hr className="border-border my-3" />
          <div className="sm:divide-border grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x">
            <div className="text-sm leading-relaxed sm:pr-4">
              {activeA?.reason ? (
                <MarkdownContent text={activeA.reason} />
              ) : (
                <p className="text-muted-foreground">No reasoning provided.</p>
              )}
            </div>
            <div className="text-sm leading-relaxed sm:pl-4">
              {activeB?.reason ? (
                <MarkdownContent text={activeB.reason} />
              ) : (
                <p className="text-muted-foreground">No reasoning provided.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        effectiveScorer && (
          <>
            <hr className="border-border my-3" />
            <p className="text-muted-foreground text-sm">No reasoning provided for this scorer.</p>
          </>
        )
      )}
    </div>
  );
}

// ---------- Comparison Detail Sheet ----------

function ComparisonDetailSheet({
  item,
  open,
  onOpenChange,
}: {
  item: ComparisonItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const inputText = (() => {
    if (item.input === null || item.input === undefined) return '\u2014';
    if (typeof item.input === 'string') return item.input;
    if (typeof item.input === 'object') {
      const obj = item.input as Record<string, unknown>;
      for (const key of ['question', 'text', 'content', 'input', 'prompt']) {
        if (typeof obj[key] === 'string') return obj[key] as string;
      }
      return JSON.stringify(item.input, null, 2);
    }
    return String(item.input);
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizable defaultWidth={900} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Comparison Detail</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* Input */}
          <div>
            <SectionLabel>Input</SectionLabel>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{inputText}</p>
          </div>

          {/* Ground truth */}
          {item.groundTruth !== null && item.groundTruth !== undefined && (
            <div>
              <SectionLabel>Expected</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{truncateValue(item.groundTruth, 500)}</p>
            </div>
          )}

          {/* Scores */}
          <div>
            <SectionLabel>Scores</SectionLabel>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="border-border bg-card rounded-lg border px-4 py-3">
                <p className="text-muted-foreground text-xs font-medium">Baseline</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {item.scoreA !== null && item.scoreA !== undefined && (
                    <span className={`size-2 shrink-0 rounded-full ${scoreDotClass(item.scoreA)}`} />
                  )}
                  <span className="text-xl leading-none font-semibold tabular-nums">
                    {item.scoreA?.toFixed(2) ?? '\u2014'}
                  </span>
                </div>
              </div>
              <div className="border-border bg-card rounded-lg border px-4 py-3">
                <p className="text-muted-foreground text-xs font-medium">Delta</p>
                <div className="mt-1.5">
                  {item.delta !== null ? (
                    <span
                      className={`inline-flex items-center gap-1 text-xl leading-none font-semibold tabular-nums ${item.delta > 0 ? 'text-emerald-500' : item.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                    >
                      {item.delta > 0 && <ArrowUpIcon className="size-4" />}
                      {item.delta < 0 && <ArrowDownIcon className="size-4" />}
                      {item.delta >= 0 ? '+' : ''}
                      {item.delta.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xl leading-none font-semibold">{'\u2014'}</span>
                  )}
                </div>
              </div>
              <div className="border-border bg-card rounded-lg border px-4 py-3">
                <p className="text-muted-foreground text-xs font-medium">Candidate</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {item.scoreB !== null && item.scoreB !== undefined && (
                    <span className={`size-2 shrink-0 rounded-full ${scoreDotClass(item.scoreB)}`} />
                  )}
                  <span className="text-xl leading-none font-semibold tabular-nums">
                    {item.scoreB?.toFixed(2) ?? '\u2014'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Responses */}
          <div>
            <SectionLabel>Responses</SectionLabel>
            <div className="sm:divide-border mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x">
              <div className="sm:pr-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">Baseline</p>
                <div className="text-sm leading-relaxed">
                  {item.resultA?.responseText ? (
                    <ResponseWithCitations text={item.resultA.responseText} sources={item.resultA.sources} />
                  ) : (
                    <span className="text-muted-foreground">{'\u2014'}</span>
                  )}
                </div>
              </div>
              <div className="sm:pl-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">Candidate</p>
                <div className="text-sm leading-relaxed">
                  {item.resultB?.responseText ? (
                    <ResponseWithCitations text={item.resultB.responseText} sources={item.resultB.sources} />
                  ) : (
                    <span className="text-muted-foreground">{'\u2014'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          {item.resultA?.scores?.length || item.resultB?.scores?.length ? (
            <ScoreBreakdown scoresA={item.resultA?.scores ?? []} scoresB={item.resultB?.scores ?? []} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Experiment Selector ----------

function ExperimentSelector({
  datasetId,
  excludeId,
  onSelect,
  label,
  placeholder,
}: {
  datasetId: string;
  excludeId: string;
  onSelect: (id: string) => void;
  label: string;
  placeholder: string;
}) {
  const [selectedId, setSelectedId] = useState('');

  const { data, isLoading } = useQuery<ExperimentListResponse>({
    queryKey: ['admin-experiments'],
    queryFn: () => apiFetch('/api/v1/admin/experiments'),
  });

  const candidates = useMemo(
    () =>
      (data?.experiments ?? []).filter(
        (e) => e.datasetId === datasetId && e.id !== excludeId && e.status === 'completed',
      ),
    [data, datasetId, excludeId],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<GitCompareArrowsIcon className="size-8" />}
        title="No experiments to compare"
        description="There are no other completed experiments with the same dataset."
      />
    );
  }

  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <h3 className="text-muted-foreground text-sm font-medium">{label}</h3>
      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name || e.id.slice(0, 12)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={!selectedId} onClick={() => onSelect(selectedId)}>
          Compare
        </Button>
      </div>
    </div>
  );
}

// ---------- Main Page ----------

export function ExperimentComparePage() {
  const navigate = useNavigate();
  const { a, b, item: itemIdx } = useSearch({ strict: false }) as { a?: string; b?: string; item?: number };

  // The known experiment is whichever param is set (used to get datasetId for filtering)
  const knownId = a || b;

  // Fetch known experiment details (to get datasetId for filtering)
  const { data: knownExperiment } = useQuery<Experiment>({
    queryKey: ['admin-experiment', knownId],
    queryFn: () => apiFetch(`/api/v1/admin/experiments/${knownId}`),
    enabled: !!knownId,
  });

  // Fetch comparison data when both a and b are provided
  const { data: comparison, isLoading: comparisonLoading } = useQuery<ComparisonResponse>({
    queryKey: ['admin-experiment-compare', a, b],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (a) params.set('a', a);
      if (b) params.set('b', b);
      const raw = await apiFetch<CompareApiResponse>(`/api/v1/admin/experiments/compare?${params}`);

      // Transform API response shape to UI expected shape
      return {
        experimentA: {
          id: raw.experimentA?.id ?? '',
          name: raw.experimentA?.name ?? null,
          avgScore: raw.aggregate?.avgScoreA ?? null,
        },
        experimentB: {
          id: raw.experimentB?.id ?? '',
          name: raw.experimentB?.name ?? null,
          avgScore: raw.aggregate?.avgScoreB ?? null,
        },
        items: (raw.items ?? []).map((item: Record<string, unknown>, i: number) => {
          const rA = item.resultA as Record<string, unknown> | null;
          const rB = item.resultB as Record<string, unknown> | null;
          return {
            index: i,
            input: item.input,
            groundTruth: rA?.groundTruth ?? rB?.groundTruth ?? null,
            scoreA: extractResultScore(rA),
            scoreB: extractResultScore(rB),
            delta: (item.scoreDelta as number | null) ?? null,
            resultA: rA?.output ? (rA.output as ResultDetail) : null,
            resultB: rB?.output ? (rB.output as ResultDetail) : null,
          };
        }),
        summary: {
          improvements: raw.aggregate?.improvementCount ?? 0,
          regressions: raw.aggregate?.regressionCount ?? 0,
          unchanged:
            (raw.items?.length ?? 0) - (raw.aggregate?.improvementCount ?? 0) - (raw.aggregate?.regressionCount ?? 0),
        },
      } satisfies ComparisonResponse;
    },
    enabled: !!a && !!b,
  });

  const compareSubtitle = comparison
    ? `Compare: ${comparison.experimentA.name || 'A'} vs ${comparison.experimentB.name || 'B'}`
    : undefined;
  usePageTitle(detailTitle('Experiments', compareSubtitle));

  // Derive selected item from URL param
  const selectedItem: ComparisonItem | null = useMemo(
    () => (itemIdx !== null && itemIdx !== undefined && comparison ? (comparison.items[itemIdx] ?? null) : null),
    [itemIdx, comparison],
  );

  function handleSelectBaseline(baselineId: string) {
    navigate({ to: '/experiments/compare', search: { a: baselineId, b }, replace: true });
  }

  function handleSelectCandidate(candidateId: string) {
    navigate({ to: '/experiments/compare', search: { a, b: candidateId }, replace: true });
  }

  function handleSwap() {
    navigate({ to: '/experiments/compare', search: { a: b, b: a }, replace: true });
  }

  const columns: ColumnDef<ComparisonItem, unknown>[] = useMemo(
    () => [
      {
        id: 'input',
        header: 'Input',
        accessorFn: (row) => truncateValue(row.input, 200),
        cell: ({ row }) => <div className="max-w-[240px] truncate text-sm">{truncateValue(row.original.input)}</div>,
      },
      {
        id: 'scoreA',
        header: 'Baseline',
        accessorFn: (row) => row.scoreA ?? -Infinity,
        cell: ({ row }) => {
          const scores = row.original.resultA?.scores;
          const scoreVal = row.original.scoreA;
          if (scoreVal === null || scoreVal === undefined)
            return <span className="text-muted-foreground">&mdash;</span>;
          if (!scores || scores.length <= 1) {
            return <span className="tabular-nums">{scoreVal.toFixed(2)}</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default tabular-nums">{scoreVal.toFixed(2)}</span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                <div className="space-y-0.5">
                  {scores.map((s) => (
                    <div key={s.scorerId ?? s.name ?? 'unknown'} className="flex items-center justify-between gap-3">
                      <span>{s.name ?? s.scorerId ?? 'unknown'}</span>
                      <span className="font-medium tabular-nums">
                        {s.status === 'skipped'
                          ? 'N/A'
                          : s.score !== null && s.score !== undefined
                            ? s.score.toFixed(2)
                            : '\u2014'}
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: 'scoreB',
        header: 'Candidate',
        accessorFn: (row) => row.scoreB ?? -Infinity,
        cell: ({ row }) => {
          const scores = row.original.resultB?.scores;
          const scoreVal = row.original.scoreB;
          if (scoreVal === null || scoreVal === undefined)
            return <span className="text-muted-foreground">&mdash;</span>;
          if (!scores || scores.length <= 1) {
            return <span className="tabular-nums">{scoreVal.toFixed(2)}</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default tabular-nums">{scoreVal.toFixed(2)}</span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                <div className="space-y-0.5">
                  {scores.map((s) => (
                    <div key={s.scorerId ?? s.name ?? 'unknown'} className="flex items-center justify-between gap-3">
                      <span>{s.name ?? s.scorerId ?? 'unknown'}</span>
                      <span className="font-medium tabular-nums">
                        {s.status === 'skipped'
                          ? 'N/A'
                          : s.score !== null && s.score !== undefined
                            ? s.score.toFixed(2)
                            : '\u2014'}
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: 'delta',
        header: 'Delta',
        accessorFn: (row) => row.delta ?? -Infinity,
        cell: ({ row }) => <DeltaIndicator delta={row.original.delta} />,
      },
    ],
    [],
  );

  // Compute overall delta between A and B avg scores
  const overallDelta =
    comparison?.experimentA.avgScore !== null &&
    comparison?.experimentA.avgScore !== undefined &&
    comparison?.experimentB.avgScore !== null &&
    comparison?.experimentB.avgScore !== undefined
      ? comparison.experimentB.avgScore - comparison.experimentA.avgScore
      : null;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/experiments" className="text-muted-foreground hover:text-foreground transition-colors">
                Experiments
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              Compare
            </span>
          }
          description="Side-by-side comparison of experiment results"
        />

        {!a && !b && (
          <div className="mt-6">
            <EmptyState
              icon={<GitCompareArrowsIcon className="size-8" />}
              title="No experiment selected"
              description="Navigate here from an experiment detail page to start a comparison."
            />
          </div>
        )}

        {/* Selector for baseline (A) when only candidate (B) is provided */}
        {!a && b && knownExperiment && (
          <div className="mt-6">
            <ExperimentSelector
              datasetId={knownExperiment.datasetId}
              excludeId={b}
              onSelect={handleSelectBaseline}
              label="Select a baseline to compare against"
              placeholder="Select baseline (A)"
            />
          </div>
        )}

        {/* Selector for candidate (B) when only baseline (A) is provided */}
        {a && !b && knownExperiment && (
          <div className="mt-6">
            <ExperimentSelector
              datasetId={knownExperiment.datasetId}
              excludeId={a}
              onSelect={handleSelectCandidate}
              label="Select a candidate to compare against"
              placeholder="Select candidate (B)"
            />
          </div>
        )}

        {/* Comparison results */}
        {a && b && comparisonLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {a && b && comparison && (
          <>
            {/* Swap button */}
            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleSwap}>
                <ArrowLeftRightIcon className="mr-1.5 size-3.5" />
                Swap A / B
              </Button>
            </div>

            {/* Aggregate stat cards */}
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="border-border bg-card rounded-lg border px-5 py-4">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Baseline (A)</p>
                <p className="text-foreground mt-1 h-5 truncate text-sm font-medium">
                  {comparison.experimentA.name || comparison.experimentA.id.slice(0, 8)}
                </p>
                <p className="text-muted-foreground mt-3 text-xs">Avg. score</p>
                <span className="text-foreground mt-1 block text-xl leading-none font-semibold tracking-tight">
                  {comparison.experimentA.avgScore !== null && comparison.experimentA.avgScore !== undefined
                    ? comparison.experimentA.avgScore.toFixed(2)
                    : '\u2014'}
                </span>
              </div>

              <div className="border-border bg-card rounded-lg border px-5 py-4">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Delta</p>
                <p className="text-foreground mt-1 h-5 truncate text-sm font-medium">Candidate − Baseline</p>
                <p className="text-muted-foreground mt-3 text-xs">Score change</p>
                <span className="mt-1 block">
                  {overallDelta !== null ? (
                    <span
                      className={`inline-flex items-center gap-1 text-xl leading-none font-semibold tracking-tight ${overallDelta > 0 ? 'text-emerald-500' : overallDelta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                    >
                      {overallDelta > 0 && <ArrowUpIcon className="size-4" />}
                      {overallDelta < 0 && <ArrowDownIcon className="size-4" />}
                      {overallDelta >= 0 ? '+' : ''}
                      {overallDelta.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-foreground text-xl leading-none font-semibold tracking-tight">
                      {'\u2014'}
                    </span>
                  )}
                </span>
              </div>

              <div className="border-border bg-card rounded-lg border px-5 py-4">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Candidate (B)</p>
                <p className="text-foreground mt-1 h-5 truncate text-sm font-medium">
                  {comparison.experimentB.name || comparison.experimentB.id.slice(0, 8)}
                </p>
                <p className="text-muted-foreground mt-3 text-xs">Avg. score</p>
                <span className="text-foreground mt-1 block text-xl leading-none font-semibold tracking-tight">
                  {comparison.experimentB.avgScore !== null && comparison.experimentB.avgScore !== undefined
                    ? comparison.experimentB.avgScore.toFixed(2)
                    : '\u2014'}
                </span>
              </div>
            </div>

            {/* Summary line */}
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className="text-emerald-400">
                {comparison.summary.improvements} improvement{comparison.summary.improvements !== 1 ? 's' : ''}
              </span>
              <span className="text-red-400">
                {comparison.summary.regressions} regression{comparison.summary.regressions !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground">{comparison.summary.unchanged} unchanged</span>
            </div>

            {/* Per-item comparison table */}
            <div className="mt-6">
              {comparison.items.length > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <DataTable
                    data={comparison.items}
                    columns={columns}
                    enableSorting
                    enableFiltering
                    getRowId={(row) => String(row.index)}
                    onRowClick={(row) =>
                      navigate({ to: '/experiments/compare', search: { a, b, item: row.index }, replace: true })
                    }
                    showRowCount
                  />
                </TooltipProvider>
              ) : (
                <EmptyState
                  icon={<GitCompareArrowsIcon className="size-8" />}
                  title="No comparison data"
                  description="There are no items to compare between these experiments."
                />
              )}
            </div>
          </>
        )}
      </div>

      <ComparisonDetailSheet
        item={selectedItem}
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) navigate({ to: '/experiments/compare', search: { a, b, item: undefined }, replace: true });
        }}
      />
    </div>
  );
}
