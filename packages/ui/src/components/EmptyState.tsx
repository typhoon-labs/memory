import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface EmptyStateProps {
  /** Optional icon to display above the title. */
  icon?: ReactNode;
  /** The main heading text. */
  title: string;
  /** Optional descriptive text below the title. */
  description?: string;
  /** Optional action element (button or link) displayed below the description. */
  action?: ReactNode;
  /** Additional CSS classes to merge onto the wrapper. */
  className?: string;
}

/**
 * A centered empty state component with optional icon, title, description,
 * and action button.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      {icon !== null && icon !== undefined && (
        <div data-slot="icon" className="text-muted-foreground mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-foreground text-lg font-semibold">{title}</h3>
      {description !== null && description !== undefined && (
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      )}
      {action !== null && action !== undefined && (
        <div data-slot="action" className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}
