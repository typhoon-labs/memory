import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'pending';

export interface StatusBadgeProps {
  /** The visual variant determining the badge color scheme. */
  variant: StatusBadgeVariant;
  /** The label text to display inside the badge. */
  children: ReactNode;
  /** Additional CSS classes to merge. */
  className?: string;
}

const dotColors: Record<StatusBadgeVariant, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  pending: 'bg-zinc-500',
};

const textColors: Record<StatusBadgeVariant, string> = {
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  pending: 'text-zinc-500',
};

/**
 * A compact status indicator with a colored dot and label text.
 */
export function StatusBadge({ variant, children, className }: StatusBadgeProps): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', textColors[variant], className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', dotColors[variant])} />
      {children}
    </span>
  );
}
