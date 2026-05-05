import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: Array<{ value: number | null }>;
  color?: string;
  width?: number | string;
  height?: number;
}

/** Minimal inline sparkline — no axes, grid, or legend. */
export function Sparkline({ data, color = 'var(--chart-1)', width = 120, height = 40 }: SparklineProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width={width} height={height} className="[&_*]:outline-none">
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Area
          type="linear"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
