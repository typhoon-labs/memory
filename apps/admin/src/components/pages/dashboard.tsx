import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, DataTable, EmptyState, LoadingSpinner, PageHeader, StatCard } from '@typhoon/ui';
import {
  ActivityIcon,
  BarChart3Icon,
  CoinsIcon,
  FileTextIcon,
  FolderSyncIcon,
  GaugeIcon,
  TrendingDownIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { LatencyChart } from '../charts/latency-chart';
import { ScoreTrendChart } from '../charts/score-trend-chart';
import { Sparkline } from '../charts/sparkline';
import { TokenBarChart } from '../charts/token-bar-chart';

// ---------- Types ----------

type DateRange = '1d' | '3d' | '7d' | '30d' | '90d';

interface ScoreDataPoint {
  date: string;
  scorerId: string;
  avgScore: number;
  count: number;
  failCount: number;
}

interface DashboardThread {
  threadId: string;
  title: string;
  resourceId: string;
  avgScore: number;
  minScore: number;
  scoreCount: number;
  createdAt: string;
}

interface DashboardUser {
  resourceId: string;
  avgScore: number;
  minScore: number;
  scoreCount: number;
  threadCount: number;
}

// ---------- Helpers ----------

function useDateRange(range: DateRange) {
  return useMemo(() => {
    const now = new Date();
    const days = { '1d': 1, '3d': 3, '7d': 7, '30d': 30, '90d': 90 }[range];
    return {
      dateFrom: new Date(now.getTime() - days * 86_400_000).toISOString(),
      dateTo: now.toISOString(),
    };
  }, [range]);
}

function fetchDashboard<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  return apiFetch(`/api/v1/admin/dashboard/${path}?${qs}`);
}

// ---------- Date Range Tabs ----------

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '1d', label: '24h' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function DateRangeTabs({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div className="flex gap-1 rounded-md border border-border p-0.5">
      {DATE_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            value === opt.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Widget Card Wrapper ----------

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------- Main Dashboard ----------

export function AdminDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>('30d');
  const { dateFrom, dateTo } = useDateRange(range);

  // Existing data queries (retained from original dashboard)
  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiFetch('/api/v1/documents'),
  });

  const targets = useQuery({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch('/api/v1/sync-targets'),
  });

  // Analytics queries
  const scores = useQuery<{ series: ScoreDataPoint[] }>({
    queryKey: ['dashboard-scores', dateFrom, dateTo],
    queryFn: () => fetchDashboard('scores', { dateFrom, dateTo }),
  });

  const worstThreads = useQuery<{ threads: DashboardThread[] }>({
    queryKey: ['dashboard-threads', dateFrom, dateTo],
    queryFn: () => fetchDashboard('threads', { dateFrom, dateTo, limit: '10' }),
  });

  const users = useQuery<{ users: DashboardUser[] }>({
    queryKey: ['dashboard-users', dateFrom, dateTo],
    queryFn: () => fetchDashboard('users', { dateFrom, dateTo, limit: '10' }),
  });

  const latency = useQuery<{ series: Array<{ date: string; p50: number; p95: number; p99: number; count: number }> }>({
    queryKey: ['dashboard-latency', dateFrom, dateTo],
    queryFn: () => fetchDashboard('latency', { dateFrom, dateTo }),
  });

  const cost = useQuery<{
    series: Array<{ date: string; promptTokens: number; completionTokens: number; callCount: number }>;
  }>({
    queryKey: ['dashboard-cost', dateFrom, dateTo],
    queryFn: () => fetchDashboard('cost', { dateFrom, dateTo }),
  });

  // Derived stat values
  const readyCount = docs.data?.filter((d: { status: string }) => d.status === 'ready').length ?? 0;
  const docTotal = docs.data?.length ?? 0;

  const scoreSeries = scores.data?.series ?? [];
  const avgScoreOverall = useMemo(() => {
    if (scoreSeries.length === 0) return null;
    const total = scoreSeries.reduce((sum, p) => sum + p.avgScore * p.count, 0);
    const count = scoreSeries.reduce((sum, p) => sum + p.count, 0);
    return count > 0 ? total / count : null;
  }, [scoreSeries]);

  const avgScoreData = useMemo(() => {
    const byDay = new Map<string, { total: number; count: number }>();
    for (const p of scoreSeries) {
      const day = p.date.slice(0, 10);
      const existing = byDay.get(day);
      if (existing) {
        existing.total += p.avgScore * p.count;
        existing.count += p.count;
      } else {
        byDay.set(day, { total: p.avgScore * p.count, count: p.count });
      }
    }
    return Array.from(byDay.values()).map((d) => ({ value: d.count > 0 ? d.total / d.count : 0 }));
  }, [scoreSeries]);

  const hallucinationData = useMemo(() => {
    const byDay = new Map<string, { total: number; count: number }>();
    for (const p of scoreSeries.filter((s) => s.scorerId === 'hallucination')) {
      const day = p.date.slice(0, 10);
      const existing = byDay.get(day);
      if (existing) {
        existing.total += p.avgScore * p.count;
        existing.count += p.count;
      } else {
        byDay.set(day, { total: p.avgScore * p.count, count: p.count });
      }
    }
    return Array.from(byDay.values()).map((d) => ({ value: d.count > 0 ? d.total / d.count : 0 }));
  }, [scoreSeries]);

  const hallucinationAvg = useMemo(() => {
    if (hallucinationData.length === 0) return null;
    return hallucinationData.reduce((s, d) => s + d.value, 0) / hallucinationData.length;
  }, [hallucinationData]);

  // Thread table columns
  const threadColumns: ColumnDef<DashboardThread, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Thread',
        cell: ({ row }) => (
          <div className="max-w-[200px] truncate font-medium">
            {row.original.title || (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.threadId.slice(0, 12)}</code>
            )}
          </div>
        ),
      },
      {
        id: 'avgScore',
        header: 'Avg',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.avgScore?.toFixed(2) ?? '\u2014'}</span>
        ),
      },
      {
        id: 'minScore',
        header: 'Worst',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.minScore?.toFixed(2) ?? '\u2014'}</span>
        ),
      },
      {
        accessorKey: 'scoreCount',
        header: 'Scores',
        cell: ({ row }) => <span className="tabular-nums">{row.original.scoreCount}</span>,
      },
    ],
    [],
  );

  // User table columns
  const userColumns: ColumnDef<DashboardUser, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'resourceId',
        header: 'User',
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.resourceId.slice(0, 12)}</code>
        ),
      },
      {
        id: 'avgScore',
        header: 'Avg',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.avgScore?.toFixed(2) ?? '\u2014'}</span>
        ),
      },
      {
        accessorKey: 'threadCount',
        header: 'Threads',
        cell: ({ row }) => <span className="tabular-nums">{row.original.threadCount}</span>,
      },
      {
        accessorKey: 'scoreCount',
        header: 'Scores',
        cell: ({ row }) => <span className="tabular-nums">{row.original.scoreCount}</span>,
      },
    ],
    [],
  );

  const isLoading = scores.isLoading && worstThreads.isLoading && latency.isLoading;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader title="Dashboard" description="System overview and response quality analytics" />
          <DateRangeTabs value={range} onChange={setRange} />
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Row 1: Stat Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Sync Sources"
            value={targets.data?.length ?? '\u2014'}
            icon={<FolderSyncIcon className="size-4" />}
          />
          <StatCard
            label="Documents"
            value={docTotal > 0 ? `${readyCount} / ${docTotal}` : '\u2014'}
            description={docTotal > 0 ? `${readyCount} ready` : undefined}
            icon={<FileTextIcon className="size-4" />}
          />
          <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <div className="px-5 pt-4 pb-10">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Avg Score</p>
                <GaugeIcon className="size-4 text-muted-foreground" />
              </div>
              <span className="mt-1.5 block text-xl font-semibold leading-none tracking-tight text-foreground">
                {avgScoreOverall !== null ? avgScoreOverall.toFixed(2) : '\u2014'}
              </span>
            </div>
            {avgScoreData.length > 1 && (
              <div className="absolute inset-x-0 bottom-0">
                <Sparkline data={avgScoreData} color="oklch(0.65 0.1 165)" width="100%" height={32} />
              </div>
            )}
          </div>
          <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <div className="px-5 pt-4 pb-10">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Hallucination Rate</p>
                <TrendingDownIcon className="size-4 text-muted-foreground" />
              </div>
              <span className="mt-1.5 block text-xl font-semibold leading-none tracking-tight text-foreground">
                {hallucinationAvg !== null ? hallucinationAvg.toFixed(2) : '\u2014'}
              </span>
              {hallucinationAvg !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {hallucinationAvg <= 0.3 ? 'Low' : hallucinationAvg <= 0.5 ? 'Moderate' : 'High'} — lower is better
                </p>
              )}
            </div>
            {hallucinationData.length > 1 && (
              <div className="absolute inset-x-0 bottom-0">
                <Sparkline data={hallucinationData} color="oklch(0.65 0.1 250)" width="100%" height={32} />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Score Trend Chart */}
        <div className="mt-6">
          <WidgetCard title="Score Distributions Over Time">
            {scores.data?.series && scores.data.series.length > 0 ? (
              <ScoreTrendChart data={scores.data.series} range={range} />
            ) : !scores.isLoading ? (
              <EmptyState
                icon={<BarChart3Icon className="size-6" />}
                title="No score data"
                description="Scores will appear once users start chatting with the agent."
              />
            ) : null}
          </WidgetCard>
        </div>

        {/* Row 3: Worst Threads + Per-User Quality */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WidgetCard title="Worst-Scoring Threads">
            {worstThreads.data?.threads && worstThreads.data.threads.length > 0 ? (
              <DataTable
                data={worstThreads.data.threads}
                columns={threadColumns}
                pageSize={10}
                getRowId={(row) => row.threadId}
                onRowClick={(row) => navigate({ to: '/reviews/$threadId', params: { threadId: row.threadId } })}
              />
            ) : !worstThreads.isLoading ? (
              <EmptyState
                icon={<ActivityIcon className="size-6" />}
                title="No scored threads"
                description="Threads with scores will appear here."
              />
            ) : null}
          </WidgetCard>

          <WidgetCard title="Per-User Quality">
            {users.data?.users && users.data.users.length > 0 ? (
              <DataTable
                data={users.data.users}
                columns={userColumns}
                pageSize={10}
                getRowId={(row) => row.resourceId}
              />
            ) : !users.isLoading ? (
              <EmptyState
                icon={<ActivityIcon className="size-6" />}
                title="No user data"
                description="Per-user quality metrics will appear once conversations are scored."
              />
            ) : null}
          </WidgetCard>
        </div>

        {/* Row 4: Latency + Token Usage */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WidgetCard title="Response Latency">
            {latency.data?.series && latency.data.series.length > 0 ? (
              <LatencyChart data={latency.data.series} range={range} />
            ) : !latency.isLoading ? (
              <EmptyState
                icon={<GaugeIcon className="size-6" />}
                title="No latency data"
                description="Latency metrics require agent spans in the ai_spans table."
              />
            ) : null}
          </WidgetCard>

          <WidgetCard title="Token Usage">
            {cost.data?.series && cost.data.series.length > 0 ? (
              <TokenBarChart data={cost.data.series} range={range} />
            ) : !cost.isLoading ? (
              <EmptyState
                icon={<CoinsIcon className="size-6" />}
                title="No token data"
                description="Token usage metrics require LLM spans in the ai_spans table."
              />
            ) : null}
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
