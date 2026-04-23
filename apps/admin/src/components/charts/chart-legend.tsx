import type { LegendPayload } from 'recharts/types/component/DefaultLegendContent';

/** Custom Recharts legend with colored dots and labels matching app typography. */
export function ChartLegend({ payload }: { payload?: LegendPayload[] }) {
  if (!payload?.length) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {payload.map((entry) => (
        <span key={entry.value} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </span>
      ))}
    </div>
  );
}
