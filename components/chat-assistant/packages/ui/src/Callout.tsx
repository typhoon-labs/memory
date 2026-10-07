/**
 * An action or a question that did not go through: who refused, why, and the
 * name of the service's rule if one did. The card and the chat pane draw it
 * the same way. Red with a shield is the gateway, amber the service; anything
 * else failed. The page's own start-up failing is an error: red, with no shield.
 */
import { BanIcon, CircleAlertIcon, ShieldXIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES: Record<string, { Icon: LucideIcon; box: string; head: string }> = {
  gateway: { Icon: ShieldXIcon, box: 'border-destructive-line bg-destructive-wash', head: 'text-destructive' },
  service: { Icon: BanIcon, box: 'border-warning-line bg-warning-wash', head: 'text-warning' },
  failed: { Icon: CircleAlertIcon, box: 'border-border bg-muted', head: 'text-foreground' },
  error: { Icon: CircleAlertIcon, box: 'border-destructive-line bg-destructive-wash', head: 'text-destructive' },
};

export interface Outcome {
  /** `gateway` or `service` for a refusal, `error` for a page that could not start; anything else is drawn as a failure. */
  tone: string;
  title: string;
  text: string;
  rule?: string;
}

export function Callout({ tone, title, text, rule, role, className }: Outcome & { role?: 'status' | 'alert'; className?: string }) {
  const { Icon, box, head } = TONES[tone] ?? TONES.failed!;
  return (
    <div role={role} className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 rounded-lg border px-3 py-2 text-sm', box, className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4', head)} />
      <div>
        <p className={cn('font-semibold', head)}>{title}</p>
        <p className="[overflow-wrap:anywhere]">
          {text}
          {rule && (
            <>
              {' '}
              Rule <code className="rounded bg-black/6 px-1 py-px font-mono text-[0.8125rem]">{rule}</code>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
