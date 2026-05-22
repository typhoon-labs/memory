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
      <div className="border-border bg-popover rounded-lg border px-3 py-2.5 shadow-lg">
        <p className="text-muted-foreground mb-1.5 text-xs font-medium">{formattedLabel}</p>
        <div className="flex flex-col gap-1">
          {payload.map((entry) => (
            <div key={String(entry.name)} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground text-xs">{String(entry.name)}</span>
              <span className="text-foreground ml-auto text-xs font-medium tabular-nums">
                {valueFormatter ? valueFormatter(Number(entry.value), String(entry.name)) : String(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
}
