import { cn } from '@typhoon/ui';

/** Plain colored text for score values. Replaces colored pill Badge. */
export function ScoreText({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">&mdash;</span>;

  const rounded = Math.round(score * 100) / 100;
  const color = score >= 0.7 ? 'text-emerald-400' : score >= 0.5 ? 'text-amber-400' : 'text-red-400';

  return <span className={cn('text-sm font-medium tabular-nums', color)}>{rounded.toFixed(2)}</span>;
}
