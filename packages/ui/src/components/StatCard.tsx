import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface StatCardProps {
  /** The main numeric or text value. */
  value: string | number;
  /** Short label describing the stat. */
  label: string;
  /** Optional description or secondary info. */
  description?: string;
  /** Optional trend indicator: positive, negative, or neutral. */
  trend?: 'up' | 'down' | 'neutral';
  /** Optional trend value text (e.g., "+12%", "-3"). */
  trendValue?: string;
  /** Optional icon element displayed top-right. */
  icon?: ReactNode;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * A stat card displaying a key metric. Flat, border-only design.
 */
export function StatCard({
  value,
  label,
  description,
  trend,
  trendValue,
  icon,
  className,
}: StatCardProps): React.JSX.Element {
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className={cn('border-border bg-card rounded-lg border px-5 py-4', className)}>
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">{label}</p>
        {icon !== null && icon !== undefined && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-foreground text-xl leading-none font-semibold tracking-tight">{value}</span>
        {trend !== null && trend !== undefined && trendValue !== null && trendValue !== undefined && (
          <span className={cn('text-xs font-medium', trendColor)}>
            {trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'} {trendValue}
          </span>
        )}
      </div>
      {description !== null && description !== undefined && (
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      )}
    </div>
  );
}
