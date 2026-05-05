import { useCallback, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartLegend } from './chart-legend';
import { createChartTooltip } from './chart-tooltip';
import { type DateRange, formatDateForRange, getTimeTicks } from './chart-utils';

interface TokenDataPoint {
  date: string;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}

interface TokenBarChartProps {
  data: TokenDataPoint[];
  range: DateRange;
}

function formatTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' };

/** Stacked bar chart showing prompt vs completion token usage per day. */
export function TokenBarChart({ data, range }: TokenBarChartProps) {
  const formatDate = useCallback((dateStr: string) => formatDateForRange(dateStr, range), [range]);
  const ticks = useMemo(
    () =>
      getTimeTicks(
        data.map((d) => d.date),
        range,
      ),
    [data, range],
  );

  const TokenTooltip = useMemo(
    () =>
      createChartTooltip({
        labelFormatter: (label) => formatDateForRange(String(label), range),
        valueFormatter: (v) => formatTokens(v),
      }),
    [range],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        No token usage data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250} className="[&_*]:outline-none">
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={AXIS_TICK} ticks={ticks} />
        <YAxis tickFormatter={formatTokens} tick={AXIS_TICK} />
        <Tooltip content={TokenTooltip} cursor={{ stroke: 'var(--border)' }} />
        <Legend content={<ChartLegend />} />
        <Bar
          dataKey="promptTokens"
          name="Prompt"
          stackId="tokens"
          fill="oklch(0.65 0.1 250)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="completionTokens"
          name="Completion"
          stackId="tokens"
          fill="oklch(0.65 0.1 165)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
