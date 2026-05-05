import type { ReactNode } from 'react';

interface WidgetCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Card wrapper for dashboard widgets. Matches admin dashboard style. */
export function WidgetCard({ title, action, children }: WidgetCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
