import { useCallback, useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartLegend } from './chart-legend';
import { createChartTooltip } from './chart-tooltip';
import { type DateRange, formatDateForRange, getTimeTicks } from './chart-utils';

interface LatencyDataPoint {
  date: string;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  count: number;
}

interface LatencyChartProps {
  data: LatencyDataPoint[];
  range: DateRange;
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' };

/** Line chart showing p50/p95/p99 response latency over time. */
export function LatencyChart({ data, range }: LatencyChartProps) {
  const formatDate = useCallback((dateStr: string) => formatDateForRange(dateStr, range), [range]);
  const ticks = useMemo(
    () =>
      getTimeTicks(
        data.map((d) => d.date),
        range,
      ),
    [data, range],
  );

  const LatencyTooltip = useMemo(
    () =>
      createChartTooltip({
        labelFormatter: (label) => formatDateForRange(String(label), range),
        valueFormatter: (v) => formatMs(v),
      }),
    [range],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        No latency data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250} className="[&_*]:outline-none">
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={AXIS_TICK} ticks={ticks} />
        <YAxis tickFormatter={formatMs} tick={AXIS_TICK} />
        <Tooltip content={LatencyTooltip} cursor={{ stroke: 'var(--border)' }} />
        <Legend content={<ChartLegend />} />
        <Line
          type="linear"
          dataKey="p50"
          name="p50"
          stroke="oklch(0.65 0.1 250)"
          strokeWidth={1.5}
          dot={{ r: 2, fill: 'oklch(0.65 0.1 250)', stroke: 'oklch(0.65 0.1 250)' }}
          activeDot={{ r: 3, fill: 'oklch(0.65 0.1 250)', stroke: 'oklch(0.65 0.1 250)' }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="p95"
          name="p95"
          stroke="oklch(0.65 0.1 165)"
          strokeWidth={1.5}
          dot={{ r: 2, fill: 'oklch(0.65 0.1 165)', stroke: 'oklch(0.65 0.1 165)' }}
          activeDot={{ r: 3, fill: 'oklch(0.65 0.1 165)', stroke: 'oklch(0.65 0.1 165)' }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="p99"
          name="p99"
          stroke="oklch(0.65 0.08 300)"
          strokeWidth={1.5}
          dot={{ r: 2, fill: 'oklch(0.65 0.08 300)', stroke: 'oklch(0.65 0.08 300)' }}
          activeDot={{ r: 3, fill: 'oklch(0.65 0.08 300)', stroke: 'oklch(0.65 0.08 300)' }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
