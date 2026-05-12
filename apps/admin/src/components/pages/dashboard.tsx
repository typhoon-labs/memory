import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { normalizeScoreForAvg, SCORER_CATEGORIES } from '@typhoon/evals/scorer-categories';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, DataTable, EmptyState, LoadingSpinner, PageHeader, StatCard } from '@typhoon/ui';
import {
  ActivityIcon,
  BarChart3Icon,
  CoinsIcon,
  FileTextIcon,
  FolderSyncIcon,
  GaugeIcon,
  SearchIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';
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
  responseAvg: number | null;
  retrievalAvg: number | null;
  scoreCount: number;
  createdAt: string;
}

interface DashboardUser {
  resourceId: string;
  email: string | null;
  responseAvg: number | null;
  retrievalAvg: number | null;
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
  usePageTitle('Dashboard');
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
  const scores = useQuery<{ series: ScoreDataPoint[]; buckets: string[] }>({
    queryKey: ['dashboard-scores', dateFrom, dateTo, range],
    queryFn: () => fetchDashboard('scores', { dateFrom, dateTo, range }),
  });

  const worstThreads = useQuery<{ threads: DashboardThread[] }>({
    queryKey: ['dashboard-threads', dateFrom, dateTo],
    queryFn: () => fetchDashboard('threads', { dateFrom, dateTo, limit: '10' }),
  });

  const users = useQuery<{ users: DashboardUser[] }>({
    queryKey: ['dashboard-users', dateFrom, dateTo],
    queryFn: () => fetchDashboard('users', { dateFrom, dateTo, limit: '10' }),
  });

  const latency = useQuery<{
    series: Array<{ date: string; p50: number | null; p95: number | null; p99: number | null; count: number }>;
  }>({
    queryKey: ['dashboard-latency', dateFrom, dateTo, range],
    queryFn: () => fetchDashboard('latency', { dateFrom, dateTo, range }),
  });

  const cost = useQuery<{
    series: Array<{ date: string; promptTokens: number; completionTokens: number; callCount: number }>;
  }>({
    queryKey: ['dashboard-cost', dateFrom, dateTo, range],
    queryFn: () => fetchDashboard('cost', { dateFrom, dateTo, range }),
  });

  // Derived stat values
  const readyCount = docs.data?.filter((d: { status: string }) => d.status === 'ready').length ?? 0;
  const docTotal = docs.data?.length ?? 0;

  const scoreSeries = scores.data?.series ?? [];
  const scoreBuckets = scores.data?.buckets ?? [];

  const { responseStats, retrievalStats } = useMemo(() => {
    function computeCategorySparkline(category: 'response' | 'retrieval') {
      const scorerIds = Object.entries(SCORER_CATEGORIES)
        .filter(([, c]) => c.category === category)
        .map(([k]) => k);

      const byBucket = new Map<string, { total: number; count: number }>();
      for (const p of scoreSeries.filter((s) => scorerIds.includes(s.scorerId))) {
        const normalized = normalizeScoreForAvg(p.scorerId, p.avgScore);
        const existing = byBucket.get(p.date);
        if (existing) {
          existing.total += normalized * p.count;
          existing.count += p.count;
        } else {
          byBucket.set(p.date, { total: normalized * p.count, count: p.count });
        }
      }

      const sparkline = scoreBuckets.map((date) => {
        const d = byBucket.get(date);
        return { value: d && d.count > 0 ? d.total / d.count : null };
      });

      const withData = sparkline.filter((d) => d.value !== null);
      const avg = withData.length > 0 ? withData.reduce((s, d) => s + (d.value as number), 0) / withData.length : null;

      return { sparkline, avg };
    }

    return {
      responseStats: computeCategorySparkline('response'),
      retrievalStats: computeCategorySparkline('retrieval'),
    };
  }, [scoreSeries, scoreBuckets]);

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
        id: 'responseAvg',
        header: 'Response',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.responseAvg?.toFixed(2) ?? '\u2014'}</span>
        ),
      },
      {
        id: 'retrievalAvg',
        header: 'Retrieval',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.retrievalAvg?.toFixed(2) ?? '\u2014'}</span>
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
          <span className="text-sm">{row.original.email ?? row.original.resourceId.slice(0, 12)}</span>
        ),
      },
      {
        id: 'responseAvg',
        header: 'Response',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.responseAvg?.toFixed(2) ?? '\u2014'}</span>
        ),
      },
      {
        id: 'retrievalAvg',
        header: 'Retrieval',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.retrievalAvg?.toFixed(2) ?? '\u2014'}</span>
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
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Response Quality</p>
                <GaugeIcon className="size-4 text-muted-foreground" />
              </div>
              <span className="mt-1.5 block text-xl font-semibold leading-none tracking-tight text-foreground">
                {responseStats.avg !== null ? responseStats.avg.toFixed(2) : '\u2014'}
              </span>
            </div>
            {responseStats.sparkline.length > 1 && (
              <div className="absolute inset-x-0 bottom-0">
                <Sparkline data={responseStats.sparkline} color="oklch(0.65 0.1 165)" width="100%" height={32} />
              </div>
            )}
          </div>
          <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <div className="px-5 pt-4 pb-10">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Retrieval Quality</p>
                <SearchIcon className="size-4 text-muted-foreground" />
              </div>
              <span className="mt-1.5 block text-xl font-semibold leading-none tracking-tight text-foreground">
                {retrievalStats.avg !== null ? retrievalStats.avg.toFixed(2) : '\u2014'}
              </span>
            </div>
            {retrievalStats.sparkline.length > 1 && (
              <div className="absolute inset-x-0 bottom-0">
                <Sparkline data={retrievalStats.sparkline} color="oklch(0.65 0.1 250)" width="100%" height={32} />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Score Trend Chart */}
        <div className="mt-6">
          <WidgetCard title="Score Distributions Over Time">
            {scores.data?.series && scores.data.series.length > 0 ? (
              <ScoreTrendChart data={scores.data.series} range={range} buckets={scores.data.buckets} />
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
          <WidgetCard title="Lowest Quality Threads">
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
