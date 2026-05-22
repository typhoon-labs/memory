import type { ReactNode } from 'react';

interface WidgetCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Card wrapper for dashboard widgets. Matches admin dashboard style. */
export function WidgetCard({ title, action, children }: WidgetCardProps) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
