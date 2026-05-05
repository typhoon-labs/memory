import { useQuery } from '@tanstack/react-query';
import { apiFetch, cn, MarkdownContent, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@typhoon/ui';
import { InfoIcon, LoaderIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReviewScore } from './shared';
import { SCORE_THRESHOLDS } from './shared';

interface ScorersResponse {
  scorers: Array<{ name: string | null; description: string | null }>;
}

function formatScorerId(id: string): string {
  const threshold = SCORE_THRESHOLDS[id];
  if (threshold) return threshold.label;
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function scoreDotClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-400/60';
  if (score >= 0.4) return 'bg-amber-400/60';
  return 'bg-red-400/60';
}

export function ScorePanel({ scores, messageCreatedAt }: { scores: ReviewScore[]; messageCreatedAt: string }) {
  const automated = scores.filter((s) => s.scorer_id !== 'human-review');
  const [selectedScorer, setSelectedScorer] = useState<string | undefined>();

  const { data: scorersData } = useQuery<ScorersResponse>({
    queryKey: ['admin-scorers'],
    queryFn: () => apiFetch('/api/v1/admin/scorers'),
    staleTime: 5 * 60 * 1000,
  });

  const scorerDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of scorersData?.scorers ?? []) {
      if (s.name && s.description) map[s.name] = s.description;
    }
    return map;
  }, [scorersData]);

  // Reset selection when scores change (new message selected)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when scores identity changes
  useEffect(() => {
    setSelectedScorer(undefined);
  }, [scores]);

  if (automated.length === 0) {
    const ageMs = Date.now() - new Date(messageCreatedAt).getTime();
    if (ageMs < 60_000) {
      return (
        <div className="flex items-center gap-1.5 py-4 text-xs text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          <span>Scoring in progress...</span>
        </div>
      );
    }
    return <p className="py-4 text-xs text-muted-foreground">No scores available for this message.</p>;
  }

  // Default: lowest scorer
  const effectiveScorer =
    selectedScorer ??
    automated.reduce(
      (lowest: ReviewScore | undefined, s) =>
        s.score !== null && (!lowest || (s.score ?? 1) < (lowest.score ?? 1)) ? s : lowest,
      undefined,
    )?.scorer_id;

  const activeScore = automated.find((s) => s.scorer_id === effectiveScorer);

  return (
    <div className="flex h-full flex-col">
      {/* Scorer list */}
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-col">
          {automated.map((s) => {
            const name = formatScorerId(s.scorer_id);
            const description = scorerDescriptions[s.scorer_id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedScorer(s.scorer_id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                  effectiveScorer === s.scorer_id ? 'bg-muted/50' : 'hover:bg-muted/30',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      s.score !== null ? scoreDotClass(s.score) : 'bg-muted-foreground/30',
                    )}
                  />
                  <span className={cn(effectiveScorer === s.scorer_id && 'font-semibold')}>{name}</span>
                  {description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3 text-muted-foreground/40 hover:text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{description}</TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className={cn('tabular-nums', effectiveScorer === s.scorer_id && 'font-semibold')}>
                  {s.score !== null ? s.score.toFixed(2) : '\u2014'}
                </span>
              </button>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Reasoning */}
      {activeScore?.reason ? (
        <>
          <div className="my-3 h-px w-full bg-muted-foreground/20" />
          <div className="min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed">
            <MarkdownContent text={activeScore.reason} />
          </div>
        </>
      ) : (
        activeScore && (
          <>
            <div className="my-3 h-px w-full bg-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No reasoning provided for this scorer.</p>
          </>
        )
      )}
    </div>
  );
}
