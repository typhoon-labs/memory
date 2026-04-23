import type { TooltipContentProps } from 'recharts';

interface ChartTooltipOptions {
  labelFormatter?: (label: string) => string;
  valueFormatter?: (value: number, name: string) => string;
}

/** Custom Recharts tooltip matching the app design system. */
export function createChartTooltip({ labelFormatter, valueFormatter }: ChartTooltipOptions = {}) {
  return function ChartTooltipContent({ active, payload, label }: TooltipContentProps) {
    if (!active || !payload?.length) return null;

    const formattedLabel = labelFormatter ? labelFormatter(String(label)) : String(label);

    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formattedLabel}</p>
        <div className="flex flex-col gap-1">
          {payload.map((entry) => (
            <div key={String(entry.name)} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-muted-foreground">{String(entry.name)}</span>
              <span className="ml-auto text-xs font-medium tabular-nums text-foreground">
                {valueFormatter ? valueFormatter(Number(entry.value), String(entry.name)) : String(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
}
