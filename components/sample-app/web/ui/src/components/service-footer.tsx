import { cn } from '@/lib/utils';
import { useHealth } from '@/lib/health';
import { useStatus } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';

/** Each service, the version it runs and its state. Pinned to the bottom of the window, so a version change is seen on any page. */
export function ServiceFooter() {
  const services = useStatus().data?.services ?? [];
  const { down } = useHealth();
  return (
    <footer className="sticky bottom-0 border-t bg-card">
      <ul aria-label="Services" className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-10 gap-y-2 px-6 py-3 text-sm">
        {services.map((service) => {
          // A service can answer its health check while its requests fail.
          const failing = service.name === 'search-service' && down.has('Search');
          const state = !service.up ? 'Not responding' : failing ? 'Failing' : 'Running';
          const bad = state !== 'Running';
          return (
            <li key={service.name} className="flex items-center gap-2.5">
              <span className="font-medium">{service.name}</span>
              <Badge variant="outline" className={cn('text-[0.8125rem] tabular-nums', !service.version && 'border-dashed font-normal')}>
                {service.version ?? 'unknown'}
              </Badge>
              {/* State is said in words and shape as well as color. */}
              <span className={cn('flex items-center gap-1.5', bad ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                <span aria-hidden className={cn('size-2.5', bad ? 'bg-destructive' : 'rounded-full bg-success')} />
                {state}
              </span>
            </li>
          );
        })}
      </ul>
    </footer>
  );
}
