import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface VolumeChartProps {
  data: Array<{ day: string; count: number }>;
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' };

/** 7-day conversation volume bar chart matching admin dashboard style. */
export function VolumeChart({ data }: VolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No conversation data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200} className="[&_*]:outline-none">
      <BarChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 500 }}
          itemStyle={{ color: 'var(--muted-foreground)' }}
          cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
        />
        <Bar
          dataKey="count"
          name="Conversations"
          fill="oklch(0.65 0.1 250)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
