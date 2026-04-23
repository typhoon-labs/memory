import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  DataTable,
  EmptyState,
  LoadingSpinner,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from '@typhoon/ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, GitCompareArrowsIcon } from 'lucide-react';
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
}

interface ExperimentListResponse {
  experiments: Experiment[];
  total: number;
}

interface ComparisonItem {
  index: number;
  input: unknown;
  scoreA: number | null;
  scoreB: number | null;
  delta: number | null;
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

// ---------- Helpers ----------

/** Extract a human-readable string from an unknown value, truncated to maxLen. */
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

/** Extract average score from an experiment result's output JSONB. */
function extractResultScore(result: Record<string, unknown> | null): number | null {
  if (!result?.output) return null;
  const output = result.output as Record<string, unknown>;
  const scores = output.scores as Array<{ score: number }> | undefined;
  if (!scores || scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
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
  return <span className="text-sm text-muted-foreground">0.00</span>;
}

// ---------- Experiment B Selector ----------

function ExperimentBSelector({
  datasetId,
  excludeId,
  onSelect,
}: {
  datasetId: string;
  excludeId: string;
  onSelect: (id: string) => void;
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
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-medium text-muted-foreground">Select an experiment to compare against</h3>
      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Select experiment B" />
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
  const { a, b } = useSearch({ strict: false }) as { a?: string; b?: string };

  // Fetch experiment A details (to get datasetId for filtering)
  const { data: experimentA } = useQuery<Experiment>({
    queryKey: ['admin-experiment', a],
    queryFn: () => apiFetch(`/api/v1/admin/experiments/${a}`),
    enabled: !!a,
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
        items: (raw.items ?? []).map((item: Record<string, unknown>, i: number) => ({
          index: i,
          input: item.input,
          scoreA: extractResultScore(item.resultA as Record<string, unknown> | null),
          scoreB: extractResultScore(item.resultB as Record<string, unknown> | null),
          delta: (item.scoreDelta as number | null) ?? null,
        })),
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

  function handleSelectB(bId: string) {
    navigate({ to: '/experiments/compare', search: { a, b: bId }, replace: true });
  }

  const columns: ColumnDef<ComparisonItem, unknown>[] = useMemo(
    () => [
      {
        id: 'input',
        header: 'Input',
        cell: ({ row }) => <div className="max-w-[240px] truncate text-sm">{truncateValue(row.original.input)}</div>,
      },
      {
        id: 'scoreA',
        header: 'Score A',
        cell: ({ row }) =>
          row.original.scoreA != null ? (
            <span className="tabular-nums">{row.original.scoreA.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'scoreB',
        header: 'Score B',
        cell: ({ row }) =>
          row.original.scoreB != null ? (
            <span className="tabular-nums">{row.original.scoreB.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          ),
      },
      {
        id: 'delta',
        header: 'Delta',
        cell: ({ row }) => <DeltaIndicator delta={row.original.delta} />,
      },
    ],
    [],
  );

  // Compute overall delta between A and B avg scores
  const overallDelta =
    comparison?.experimentA.avgScore != null && comparison?.experimentB.avgScore != null
      ? comparison.experimentB.avgScore - comparison.experimentA.avgScore
      : null;

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
              Compare
            </span>
          }
          description="Side-by-side comparison of experiment results"
        />

        {!a && (
          <div className="mt-6">
            <EmptyState
              icon={<GitCompareArrowsIcon className="size-8" />}
              title="No experiment selected"
              description="Navigate here from an experiment detail page to start a comparison."
            />
          </div>
        )}

        {/* Selector for experiment B when only A is provided */}
        {a && !b && experimentA && (
          <div className="mt-6">
            <ExperimentBSelector datasetId={experimentA.datasetId} excludeId={a} onSelect={handleSelectB} />
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
            {/* Aggregate stat cards */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label={`A: ${comparison.experimentA.name || comparison.experimentA.id.slice(0, 8)}`}
                value={comparison.experimentA.avgScore != null ? comparison.experimentA.avgScore.toFixed(2) : '\u2014'}
                description="Average score"
              />

              {/* Delta card */}
              <div className="flex items-center justify-center rounded-lg border border-border bg-card px-5 py-4">
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Delta</p>
                  <div className="mt-2">
                    {overallDelta !== null ? (
                      <DeltaIndicator delta={overallDelta} />
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </div>
                </div>
              </div>

              <StatCard
                label={`B: ${comparison.experimentB.name || comparison.experimentB.id.slice(0, 8)}`}
                value={comparison.experimentB.avgScore != null ? comparison.experimentB.avgScore.toFixed(2) : '\u2014'}
                description="Average score"
              />
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
                <DataTable
                  data={comparison.items}
                  columns={columns}
                  enableSorting
                  getRowId={(row) => String(row.index)}
                  showRowCount
                />
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
    </div>
  );
}
