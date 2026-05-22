import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function Message({
  children,
  from,
  className,
}: {
  children: ReactNode;
  from: 'user' | 'assistant' | 'system' | string;
  className?: string;
}) {
  return (
    <div className={cn('group mb-5', className)} data-role={from}>
      {children}
    </div>
  );
}

export function MessageContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-card-foreground text-sm leading-relaxed', className)}>{children}</div>;
}

export function MessageResponse({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>{children}</div>;
}

export function MessageActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100', className)}>
      {children}
    </div>
  );
}

export function MessageAction({
  children,
  onClick,
  label,
  className,
  active,
  activeClassName,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
  active?: boolean;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'text-muted-foreground/50 hover:text-muted-foreground rounded p-1 transition-colors',
        active && (activeClassName ?? 'text-muted-foreground'),
        className,
      )}
    >
      {children}
    </button>
  );
}
