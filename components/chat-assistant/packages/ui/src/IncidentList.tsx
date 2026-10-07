/**
 * The list of incidents beside the card, newest first, and the button on a
 * panel's edge that closes the panel and brings it back.
 *
 * The list is how a viewer goes back to an earlier incident: picking a row
 * puts that incident on the card. The rows come from the server with every
 * poll (`pageIn` in ./a2a); this draws them and decides nothing.
 */
import type { CSSProperties } from 'react';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { IncidentListEntry } from './a2a';
import { cn } from '@/lib/utils';

/** A status in the hue the card's badge gives it: red for open, amber for being mitigated. */
const STATUS: Record<string, { word: string; dot: string; text: string }> = {
  open: { word: 'Open', dot: 'bg-destructive-bright', text: 'text-destructive' },
  mitigating: { word: 'Mitigating', dot: 'bg-warning-bright', text: 'text-warning' },
};

function Row({ incident, selected, onPick }: { incident: IncidentListEntry; selected: boolean; onPick: (id: string) => void }) {
  const resolved = incident.status === 'resolved';
  const status = STATUS[incident.status];
  return (
    <li>
      <button
        type="button"
        aria-current={selected}
        onClick={() => onPick(incident.id)}
        className="grid w-full grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-[7px] px-2.5 pt-2 pb-[0.5625rem] text-left text-sm outline-offset-[-2px] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-secondary"
      >
        <span aria-hidden className="grid place-items-center">
          {resolved ? <CheckIcon className="size-3.5 text-success" strokeWidth={3} /> : <i className={cn('size-2 rounded-full', status?.dot ?? 'bg-faint')} />}
        </span>
        <span className="font-medium">{incident.id}</span>
        {resolved ? (
          <span className="text-[0.8125rem] text-muted-foreground tabular-nums" title={incident.resolved ? `Resolved ${incident.resolved} UTC` : undefined}>
            <span className="sr-only">Resolved </span>
            {incident.resolved}
          </span>
        ) : (
          <span className={cn('text-[0.8125rem]', status?.text ?? 'text-muted-foreground')}>{status?.word ?? incident.status}</span>
        )}
        <span className="col-start-2 col-end-4 truncate text-[0.8125rem]">{incident.summary}</span>
        <span className="col-start-2 col-end-4 truncate text-[0.8125rem] text-muted-foreground">{incident.note}</span>
      </button>
    </li>
  );
}

export function IncidentList({
  incidents,
  selected,
  onPick,
  className,
}: {
  incidents: IncidentListEntry[];
  /** The incident on the card. */
  selected?: string;
  onPick: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Incidents" className={cn('overflow-y-auto border-r bg-background px-3 pt-6 pb-12 [scrollbar-width:thin]', className)}>
      <ul className="grid gap-0.5">
        {incidents.map((incident) => (
          <Row key={incident.id} incident={incident} selected={incident.id === selected} onPick={onPick} />
        ))}
      </ul>
    </nav>
  );
}

/**
 * The button on a panel's edge, halfway down the window. It stands outside the
 * panel, on the card's side of the edge, and points the way the panel will go:
 * toward the window's edge to close it, toward the card to bring it back.
 * Closed, the panel is gone and the button is on the window's own edge.
 *
 * @param panel which side of the window the panel is on
 * @param offset how far the panel's edge is from that side of the window: the panel's width, or 0 when it is closed
 */
export function EdgeButton({
  panel,
  open,
  name,
  offset,
  news = false,
  className,
  onClick,
}: {
  panel: 'left' | 'right';
  open: boolean;
  /** What the panel is, for the button's label: "the chat". */
  name: string;
  offset: string | 0;
  /** Something arrived in the panel while it was closed. */
  news?: boolean;
  className?: string;
  onClick: () => void;
}) {
  const label = `${open ? 'Close' : 'Open'} ${name}${news && !open ? ' (something new)' : ''}`;
  const Icon = (panel === 'left') === open ? ChevronLeftIcon : ChevronRightIcon;
  const style: CSSProperties = panel === 'left' ? { left: offset } : { right: offset };
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onClick}
      style={style}
      className={cn(
        'fixed top-[50svh] z-30 grid h-12 w-[1.125rem] -translate-y-1/2 place-items-center border bg-background text-muted-foreground outline-offset-[-2px] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
        // Halfway down what is under the bar at the top, which stays in place in a wide window.
        'min-[60rem]:top-[calc(var(--head)_/_2_+_50svh)]',
        panel === 'left' ? 'rounded-r-[7px] border-l-0' : 'rounded-l-[7px] border-r-0',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      {news && !open && <i aria-hidden className="absolute -top-1 -left-1 size-2 rounded-full bg-primary ring-2 ring-background" />}
    </button>
  );
}
