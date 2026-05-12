import { useQuery } from '@tanstack/react-query';
import { apiFetch, cn, MarkdownContent, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@typhoon/ui';
import { InfoIcon, LoaderIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReviewScore } from './shared';
import { computeCategoryAverages, normalizeScoreForAvg, SCORE_THRESHOLDS, SCORER_CATEGORIES } from './shared';

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

function scoreDotClass(scorerId: string, score: number): string {
  const normalized = normalizeScoreForAvg(scorerId, score);
  if (normalized >= 0.7) return 'bg-emerald-400/60';
  if (normalized >= 0.4) return 'bg-amber-400/60';
  return 'bg-red-400/60';
}

function avgDotClass(avg: number): string {
  if (avg >= 0.7) return 'bg-emerald-400/60';
  if (avg >= 0.4) return 'bg-amber-400/60';
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

  // Group scores by category
  const responseScores = automated.filter((s) => SCORER_CATEGORIES[s.scorer_id]?.category === 'response');
  const retrievalScores = automated.filter((s) => SCORER_CATEGORIES[s.scorer_id]?.category === 'retrieval');
  const otherScores = automated.filter((s) => !SCORER_CATEGORIES[s.scorer_id]);

  // Check if retrieval scorers are expected but missing (no rows in DB)
  const retrievalScorerIds = Object.entries(SCORER_CATEGORIES)
    .filter(([, v]) => v.category === 'retrieval')
    .map(([k]) => k);
  const hasRetrievalScores = retrievalScores.length > 0;
  const retrievalExpected = retrievalScorerIds.length > 0;

  // Compute category averages
  const avgs = computeCategoryAverages(automated.map((s) => ({ scorerId: s.scorer_id, score: s.score })));

  // Default: lowest normalized scorer
  const effectiveScorer =
    selectedScorer ??
    automated
      .filter((s) => s.score !== null)
      .reduce((lowest: ReviewScore | undefined, s) => {
        const norm = normalizeScoreForAvg(s.scorer_id, s.score ?? 0);
        const lowestNorm = lowest ? normalizeScoreForAvg(lowest.scorer_id, lowest.score ?? 0) : 1;
        return norm < lowestNorm ? s : lowest;
      }, undefined)?.scorer_id;

  const activeScore = automated.find((s) => s.scorer_id === effectiveScorer);

  function renderScorerRow(s: ReviewScore) {
    const name = formatScorerId(s.scorer_id);
    const description = scorerDescriptions[s.scorer_id];
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => setSelectedScorer(s.scorer_id)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-xs transition-colors',
          effectiveScorer === s.scorer_id ? 'bg-muted' : 'hover:bg-muted',
        )}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              s.score !== null ? scoreDotClass(s.scorer_id, s.score) : 'bg-muted-foreground/30',
            )}
          />
          <span>{name}</span>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3 text-muted-foreground/40 hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{description}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="tabular-nums">{s.score !== null ? s.score.toFixed(2) : '\u2014'}</span>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TooltipProvider delayDuration={200}>
        {/* Response Quality */}
        {responseScores.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Response Quality
              </span>
              {avgs.responseAvg !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', avgDotClass(avgs.responseAvg))} />
                  {avgs.responseAvg.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-px">{responseScores.map(renderScorerRow)}</div>
          </div>
        )}

        {/* Retrieval Quality */}
        {retrievalExpected && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Retrieval Quality
              </span>
              {avgs.retrievalAvg !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', avgDotClass(avgs.retrievalAvg))} />
                  {avgs.retrievalAvg.toFixed(2)}
                </span>
              )}
              {!hasRetrievalScores && <span className="text-[10px] text-muted-foreground/60">N/A</span>}
            </div>
            {hasRetrievalScores ? (
              <div className="flex flex-col gap-px">{retrievalScores.map(renderScorerRow)}</div>
            ) : (
              <p className="px-2 text-[11px] text-muted-foreground/60">No retrieval context</p>
            )}
          </div>
        )}

        {/* Other (custom scorers) */}
        {otherScores.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Other</span>
            </div>
            <div className="flex flex-col gap-px">{otherScores.map(renderScorerRow)}</div>
          </div>
        )}
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
