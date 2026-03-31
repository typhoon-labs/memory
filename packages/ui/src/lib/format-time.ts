/**
 * Format a timestamp as a human-readable relative time string.
 *
 * @param timestamp - ISO 8601 date string
 * @param options.compact - Use short form without "ago" suffix (e.g. "5m" vs "5m ago")
 */
export function formatRelativeTime(timestamp: string, options?: { compact?: boolean }): string {
  const compact = options?.compact ?? false;
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return compact ? 'now' : 'Just now';
  if (diffMin < 60) return compact ? `${diffMin}m` : `${diffMin}m ago`;
  if (diffHr < 24) return compact ? `${diffHr}h` : `${diffHr}h ago`;
  if (diffDay < 7) return compact ? `${diffDay}d` : `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(compact ? {} : { year: 'numeric' }),
  });
}

export interface FormatAbsoluteTimeOptions {
  /** 'long' = "March", 'short' = "Mar". Default: 'long' */
  monthFormat?: 'long' | 'short';
  /** Show year. Default: true */
  includeYear?: boolean;
  /** Show time portion. Default: true */
  includeTime?: boolean;
  /** Show timezone abbreviation (e.g. "EST"). Default: true */
  includeTimezone?: boolean;
}

/**
 * Format a timestamp as a full absolute date/time string.
 *
 * Uses the browser's locale for formatting (date order, month names, 12h/24h, timezone).
 *
 * Default output: "March 9, 2026 at 11:21 AM EST"
 *
 * @param timestamp - ISO 8601 date string
 */
export function formatAbsoluteTime(timestamp: string, options?: FormatAbsoluteTimeOptions): string {
  const { monthFormat = 'long', includeYear = true, includeTime = true, includeTimezone = true } = options ?? {};

  const date = new Date(timestamp);

  const datePart = date.toLocaleDateString(undefined, {
    month: monthFormat,
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });

  if (!includeTime) return datePart;

  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(includeTimezone ? { timeZoneName: 'short' } : {}),
  });

  return `${datePart} ${timePart}`;
}
