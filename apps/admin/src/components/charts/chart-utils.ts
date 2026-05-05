export type DateRange = '1d' | '3d' | '7d' | '30d' | '90d';

/** Format a date string for x-axis ticks based on the active time range. */
export function formatDateForRange(dateStr: string, range: DateRange): string {
  const d = new Date(dateStr);
  switch (range) {
    case '1d':
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    case '3d':
      return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' });
    case '7d':
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    case '30d':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '90d':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/** Desired tick-label spacing in milliseconds per date range (~12-15 labels). */
const TICK_SPACING_MS: Record<DateRange, number> = {
  '1d': 2 * 3_600_000, // 2 hours — ~12 labels
  '3d': 6 * 3_600_000, // 6 hours — ~12 labels
  '7d': 12 * 3_600_000, // 12 hours — ~14 labels
  '30d': 2 * 86_400_000, // 2 days — ~15 labels
  '90d': 7 * 86_400_000, // 7 days — ~13 labels
};

/**
 * Build an array of tick values (date strings) spaced at fixed time intervals.
 * Pass this to `<XAxis ticks={...} />` for consistent time-based spacing.
 */
export function getTimeTicks(dates: string[], range: DateRange): string[] {
  if (dates.length <= 1) return dates;

  const spacingMs = TICK_SPACING_MS[range];
  const ticks: string[] = [dates[0]];
  let lastTickTime = new Date(dates[0]).getTime();

  for (let i = 1; i < dates.length; i++) {
    const t = new Date(dates[i]).getTime();
    if (t - lastTickTime >= spacingMs) {
      ticks.push(dates[i]);
      lastTickTime = t;
    }
  }

  return ticks;
}
