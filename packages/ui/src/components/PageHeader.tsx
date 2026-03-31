import type { ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export interface PageHeaderProps {
  /** Page title displayed as h1. */
  title: string;
  /** Optional description text below the title. */
  description?: string;
  /** Optional action elements (buttons, etc.) aligned to the right. */
  actions?: ReactNode;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Standardized page header with title, description, and action buttons.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-medium text-foreground">{title}</h1>
        {description != null && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
