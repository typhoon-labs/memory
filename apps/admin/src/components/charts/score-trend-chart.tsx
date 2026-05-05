import { useCallback, useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartLegend } from './chart-legend';
import { createChartTooltip } from './chart-tooltip';
import { type DateRange, formatDateForRange, getTimeTicks } from './chart-utils';

interface ScoreDataPoint {
  date: string;
  scorerId: string;
  avgScore: number;
  count: number;
  failCount: number;
}

interface ScoreTrendChartProps {
  data: ScoreDataPoint[];
  range: DateRange;
  buckets?: string[];
}

const SCORER_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness',
  hallucination: 'Hallucination',
  answerRelevancy: 'Answer Relevancy',
  contextRelevance: 'Context Relevance',
  contextPrecision: 'Context Precision',
};

const CHART_COLORS = [
  'oklch(0.65 0.1 250)',
  'oklch(0.65 0.1 165)',
  'oklch(0.65 0.08 300)',
  'oklch(0.65 0.1 50)',
  'oklch(0.55 0.08 200)',
];

/** Pivot flat series data into one row per date with scorer IDs as keys. */
function pivotData(data: ScoreDataPoint[], buckets?: string[]) {
  const byDate = new Map<string, Record<string, string | number>>();
  const scorerIds = new Set<string>();

  // Pre-populate all bucket dates so empty ones appear in the chart
  if (buckets) {
    for (const date of buckets) {
      byDate.set(date, { date });
    }
  }

  for (const point of data) {
    scorerIds.add(point.scorerId);
    let existing = byDate.get(point.date);
    if (!existing) {
      existing = { date: point.date };
      byDate.set(point.date, existing);
    }
    existing[point.scorerId] = point.avgScore;
  }

  return { rows: Array.from(byDate.values()), scorerIds: Array.from(scorerIds) };
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' };

/** Multi-line chart showing score averages per scorer over time. */
export function ScoreTrendChart({ data, range, buckets }: ScoreTrendChartProps) {
  const { rows, scorerIds } = useMemo(() => pivotData(data, buckets), [data, buckets]);
  const formatDate = useCallback((dateStr: string) => formatDateForRange(dateStr, range), [range]);
  const ticks = useMemo(
    () =>
      getTimeTicks(
        rows.map((r) => r.date as string),
        range,
      ),
    [rows, range],
  );

  const ScoreTooltip = useMemo(
    () =>
      createChartTooltip({
        labelFormatter: (label) => formatDateForRange(String(label), range),
        valueFormatter: (v) => Number(v).toFixed(3),
      }),
    [range],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No score data yet</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300} className="[&_*]:outline-none">
      <LineChart data={rows} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={AXIS_TICK} ticks={ticks} />
        <YAxis domain={[0, 1]} tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(1)} />
        <Tooltip content={ScoreTooltip} cursor={{ stroke: 'var(--border)' }} />
        <Legend content={<ChartLegend />} />
        {scorerIds.map((id, i) => {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <Line
              key={id}
              type="linear"
              dataKey={id}
              name={SCORER_LABELS[id] ?? id}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, fill: color, stroke: color }}
              activeDot={{ r: 3, fill: color, stroke: color }}
              connectNulls
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
