import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SectionLabel,
} from '@typhoon/ui';
import { InfoIcon, LoaderIcon, MessageSquareIcon } from 'lucide-react';
import { AnnotationPanel } from './annotation-panel';
import type { ReviewScore, UIMessage } from './shared';
import { SCORE_THRESHOLDS } from './shared';

interface ReviewPanelProps {
  threadId: string;
  message: UIMessage | null;
  scores: ReviewScore[];
}

// ---------------------------------------------------------------------------
// Score rows — minimal inline text
// ---------------------------------------------------------------------------

function isPassing(scorerId: string, score: number): boolean {
  const threshold = SCORE_THRESHOLDS[scorerId];
  if (!threshold) return score >= 0.5;
  if (threshold.invertedScale) return score <= threshold.pass;
  return score >= threshold.pass;
}

function ScoreRow({ score }: { score: ReviewScore }) {
  const threshold = SCORE_THRESHOLDS[score.scorer_id];
  const label = threshold?.label ?? score.scorer_id;
  const value = score.score;

  if (value === null) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">&mdash;</span>
      </div>
    );
  }

  const pass = isPassing(score.scorer_id, value);

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('text-xs tabular-nums font-medium', pass ? 'text-emerald-400' : 'text-red-400')}>
          {value.toFixed(2)}
        </span>
        {score.reason && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <InfoIcon className="size-3" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{label}</DialogTitle>
                <DialogDescription>
                  Score: {value.toFixed(2)} — {pass ? 'Passing' : 'Failing'}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-muted-foreground">{score.reason}</p>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

function ScoreList({ scores, messageCreatedAt }: { scores: ReviewScore[]; messageCreatedAt: string }) {
  const automated = scores.filter((s) => s.scorer_id !== 'human-review');

  if (automated.length === 0) {
    const ageMs = Date.now() - new Date(messageCreatedAt).getTime();
    const isRecent = ageMs < 60_000;

    if (isRecent) {
      return (
        <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          <span>Scoring...</span>
        </div>
      );
    }

    return <p className="py-2 text-xs text-muted-foreground">No scores available.</p>;
  }

  return (
    <div>
      {automated.map((s) => (
        <ScoreRow key={s.id} score={s} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Panel
// ---------------------------------------------------------------------------

export function ReviewPanel({ threadId, message, scores }: ReviewPanelProps) {
  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <MessageSquareIcon className="size-6 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">Select an assistant message to review</p>
      </div>
    );
  }

  const annotations = scores.filter((s) => s.scorer_id === 'human-review');

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-6 p-4">
        {/* Scores */}
        <section>
          <SectionLabel>Scores</SectionLabel>
          <div className="mt-2">
            <ScoreList scores={scores} messageCreatedAt={message.createdAt} />
          </div>
        </section>

        {/* Annotation */}
        <section>
          <SectionLabel>Annotation</SectionLabel>
          <AnnotationPanel threadId={threadId} messageId={message.id} annotations={annotations} />
        </section>
      </div>
    </div>
  );
}
