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

/** Desired tick spacing in milliseconds per date range. */
const TICK_SPACING_MS: Record<DateRange, number> = {
  '1d': 15 * 60_000, // 15 minutes
  '3d': 4 * 3_600_000, // 4 hours
  '7d': 12 * 3_600_000, // 12 hours
  '30d': 86_400_000, // 1 day
  '90d': 86_400_000, // 1 day
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
