import type { ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export interface SectionLabelProps {
  /** Label text or content. */
  children: ReactNode;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Micro uppercase label used for section headings throughout the app.
 * Provides a consistent typographic pattern for grouping content.
 */
export function SectionLabel({ children, className }: SectionLabelProps): React.JSX.Element {
  return (
    <p className={cn('text-2xs font-semibold uppercase tracking-widest text-muted-foreground', className)}>
      {children}
    </p>
  );
}
