import { SectionLabel, Sheet, SheetContent, SheetHeader, SheetTitle, StatusBadge } from '@typhoon/ui';
import { useEffect, useState } from 'react';
import type { QueueJob } from './shared';
import { formatJobDuration, formatTimestamp, isStageProgress, JOB_STATE_BADGE_MAP } from './shared';

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function JobDetailSheet({
  job,
  open,
  onOpenChange,
}: {
  job: QueueJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Re-render once per second so the elapsed time on an active stage ticks
  // forward without needing the parent query to refetch. Only ticks while a
  // structured stage progress is present (i.e. for active jobs).
  const [, force] = useState(0);
  const stageProgress = job && isStageProgress(job.progress) ? job.progress : null;
  const isActive = job?.state === 'active' && stageProgress !== null;
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizable className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div>
            <SheetTitle>{job.name}</SheetTitle>
            <div className="mt-1">
              <StatusBadge variant={JOB_STATE_BADGE_MAP[job.state] ?? 'pending'}>{job.state}</StatusBadge>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* Current stage — only meaningful for active jobs. Ticks forward
              once per second so the elapsed time advances live. SSE-driven
              query invalidation refreshes the stage label itself. */}
          {stageProgress && (
            <div>
              <SectionLabel>Current Stage</SectionLabel>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-medium text-base">{stageProgress.stage}</span>
                {isActive && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatElapsed(Date.now() - stageProgress.startedAt)} elapsed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Timing */}
          <div>
            <SectionLabel>Timing</SectionLabel>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="mt-0.5">{formatTimestamp(job.timestamp)}</dd>
              </div>
              {job.processedOn && (
                <div>
                  <dt className="text-muted-foreground">Processing Started</dt>
                  <dd className="mt-0.5">{formatTimestamp(job.processedOn)}</dd>
                </div>
              )}
              {job.finishedOn && (
                <div>
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd className="mt-0.5">{formatTimestamp(job.finishedOn)}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-0.5">{formatJobDuration(job.processedOn, job.finishedOn)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="mt-0.5">{job.attemptsMade}</dd>
              </div>
            </dl>
          </div>

          {/* Job Data */}
          <div>
            <SectionLabel>Job Data</SectionLabel>
            <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </div>

          {/* Stacktrace */}
          {job.stacktrace.length > 0 && (
            <div>
              <SectionLabel>Stacktrace</SectionLabel>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs whitespace-pre-wrap">
                {job.stacktrace.join('\n')}
              </pre>
            </div>
          )}

          {/* Return Value */}
          {job.returnvalue != null && (
            <div>
              <SectionLabel>Return Value</SectionLabel>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
                {typeof job.returnvalue === 'string' ? job.returnvalue : JSON.stringify(job.returnvalue, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
