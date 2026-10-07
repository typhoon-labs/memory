import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { clock } from '@/lib/api';
import { useHealth } from '@/lib/health';

/** Under the header on every page: red while something is down, green when it comes back. */
export function StatusBanner() {
  const { down, recovered } = useHealth();
  const [failing] = down;
  if (!failing && !recovered) return null;

  const Icon = failing ? CircleAlertIcon : CircleCheckIcon;
  const [title, detail] = failing
    ? [`${failing[0]} is unavailable`, failing[1]]
    : [`${recovered!.name} is back`, `Recovered at ${clock(recovered!.at)}.`];
  return (
    <div role="alert" className={failing ? 'bg-destructive text-white' : 'bg-success text-white'}>
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-6 py-4">
        <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div>
          <p className="text-xl leading-tight font-semibold">{title}</p>
          <p className="mt-1 tabular-nums">{detail}</p>
        </div>
      </div>
    </div>
  );
}
