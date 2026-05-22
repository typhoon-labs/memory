import { cn } from '../../lib/utils';

export function Loader({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 py-3', className)}>
      <div className="bg-muted-foreground/40 size-1.5 animate-pulse rounded-full [animation-delay:0ms]" />
      <div className="bg-muted-foreground/40 size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
      <div className="bg-muted-foreground/40 size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
    </div>
  );
}
