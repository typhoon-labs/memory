import { Check, Loader2, Timer, X } from 'lucide-react';

import { cn } from '../../../lib/utils';
import type { ProgressEvent, ProgressStep, ProgressTrackerProps } from './schema';

function formatElapsedTime(milliseconds: number): string {
  const roundedSeconds = Math.round(Math.max(0, milliseconds) / 100) / 10;

  if (roundedSeconds < 60) {
    return `${roundedSeconds.toFixed(1)}s`;
  }

  const wholeSeconds = Math.floor(roundedSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatElapsedTimeDateTime(milliseconds: number): string {
  const roundedSeconds = Math.round(Math.max(0, milliseconds) / 100) / 10;

  if (roundedSeconds < 60) {
    return `PT${Number(roundedSeconds.toFixed(1))}S`;
  }

  const wholeSeconds = Math.floor(roundedSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  const hourPart = hours > 0 ? `${hours}H` : '';
  const minutePart = minutes > 0 ? `${minutes}M` : '';
  const secondPart = seconds > 0 ? `${seconds}S` : '';

  if (!hourPart && !minutePart && !secondPart) {
    return 'PT0S';
  }

  return `PT${hourPart}${minutePart}${secondPart}`;
}

function getCurrentStepId(steps: ProgressStep[]): string | null {
  const inProgressStep = steps.find((s) => s.status === 'in-progress');
  if (inProgressStep) return inProgressStep.id;

  const failedStep = steps.find((s) => s.status === 'failed');
  if (failedStep) return failedStep.id;

  const firstPendingStep = steps.find((s) => s.status === 'pending');
  if (firstPendingStep) return firstPendingStep.id;

  return null;
}

interface StepIndicatorProps {
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

function StepIndicator({ status }: StepIndicatorProps) {
  if (status === 'pending') {
    return (
      <span
        className="bg-card border-border flex size-5 shrink-0 items-center justify-center rounded-full border motion-safe:transition-all motion-safe:duration-200"
        aria-hidden="true"
      />
    );
  }

  if (status === 'in-progress') {
    return (
      <span
        className="bg-card border-border flex size-5 shrink-0 items-center justify-center rounded-full border shadow-[0_0_0_3px_hsl(var(--primary)/0.1)] motion-safe:transition-all motion-safe:duration-300"
        aria-hidden="true"
      >
        <Loader2 className="text-primary size-4 motion-safe:animate-spin" />
      </span>
    );
  }

  if (status === 'completed') {
    return (
      <span
        className="bg-primary text-primary-foreground border-primary motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 flex size-5 shrink-0 items-center justify-center rounded-full border shadow-sm motion-safe:duration-300 motion-safe:ease-out"
        aria-hidden="true"
      >
        <Check
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 motion-safe:fill-mode-both size-3 motion-safe:delay-75 motion-safe:duration-200"
          strokeWidth={2.5}
        />
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        className="bg-muted text-muted-foreground border-border motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 flex size-5 shrink-0 items-center justify-center rounded-full border motion-safe:duration-300 motion-safe:ease-out"
        aria-hidden="true"
      >
        <X
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 motion-safe:fill-mode-both size-3 motion-safe:delay-75 motion-safe:duration-200"
          strokeWidth={2.5}
        />
      </span>
    );
  }

  return null;
}

function ElapsedTimeBadge({ elapsedTime }: { elapsedTime?: number }) {
  if (elapsedTime === undefined || elapsedTime <= 0) {
    return null;
  }

  return (
    <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
      <Timer className="-mt-px size-3.5" />
      <time dateTime={formatElapsedTimeDateTime(elapsedTime)}>{formatElapsedTime(elapsedTime)}</time>
    </div>
  );
}

function ProgressEventDot({
  status,
  stepStatus,
}: {
  status?: ProgressEvent['status'];
  stepStatus: ProgressStep['status'];
}) {
  const effective = stepStatus === 'completed' && status !== 'failed' ? 'done' : status;

  if (effective === 'done') {
    return (
      <span
        className="bg-primary motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 size-1.5 shrink-0 rounded-full motion-safe:duration-200"
        aria-hidden="true"
      />
    );
  }
  if (effective === 'failed') {
    return <span className="bg-muted-foreground/40 size-1.5 shrink-0 rounded-full" aria-hidden="true" />;
  }
  return (
    <span
      className="border-primary/40 bg-background size-1.5 shrink-0 rounded-full border-[1.5px] motion-safe:transition-colors motion-safe:duration-200"
      aria-hidden="true"
    />
  );
}

export function ProgressTracker({ id, steps, elapsedTime, className }: ProgressTrackerProps) {
  const hasInProgress = steps.some((step) => step.status === 'in-progress');
  const currentStepId = getCurrentStepId(steps);

  return (
    <output
      className={cn('isolate flex w-full flex-col py-3', 'text-foreground', className)}
      data-slot="progress-tracker"
      data-tool-ui-id={id}
      aria-live="polite"
      aria-busy={hasInProgress}
    >
      <div className="flex w-full flex-col gap-3">
        <ElapsedTimeBadge elapsedTime={elapsedTime} />

        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentStepId;
            const isActive = step.status === 'in-progress';
            const isFailed = step.status === 'failed';
            const isLast = index === steps.length - 1;
            const hasDescription = !!step.description;
            const shouldShowDescription = isActive || isFailed;
            const events = step.progressEvents ?? [];
            const hasEvents = events.length > 0;
            const showConnector = !isLast || hasEvents;

            return (
              <li key={step.id} className="relative -mx-2" aria-current={isCurrent ? 'step' : undefined}>
                {showConnector && (
                  <div
                    className={cn(
                      'bg-muted-foreground/25 absolute top-6 left-[1.125rem] w-[2px] -translate-x-1/2',
                      'motion-safe:transition-all motion-safe:duration-300',
                    )}
                    style={{
                      height: isLast ? 'calc(100% - 2.25rem)' : 'calc(100% - 0.75rem)',
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Main step row */}
                <div className="relative z-10 flex items-start gap-3 rounded-md px-2 py-1 motion-safe:transition-all motion-safe:duration-300">
                  <div className="relative z-10">
                    <StepIndicator status={step.status} />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span
                      className={cn(
                        'text-[13.5px] leading-[1.65]',
                        step.status === 'pending' && 'text-muted-foreground',
                        step.status === 'in-progress' && 'motion-safe:shimmer shimmer-invert text-foreground',
                      )}
                    >
                      {step.label}
                    </span>
                    {hasDescription && (
                      <div
                        className={cn(
                          'grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-out',
                          shouldShowDescription ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                        )}
                        aria-hidden={!shouldShowDescription}
                      >
                        <div className="overflow-hidden">
                          <span className="text-muted-foreground block pt-0.5 text-sm">{step.description}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-event rows — on the timeline */}
                {hasEvents &&
                  events.map((event, i) => {
                    const isSuperseded = event.status === 'in-progress' && i < events.length - 1;
                    return (
                      <div
                        key={`${step.id}-event-${String(i)}`}
                        className="relative z-10 flex items-center gap-3 px-2 py-0.5"
                      >
                        <div className="flex size-5 shrink-0 items-center justify-center">
                          <ProgressEventDot status={isSuperseded ? 'done' : event.status} stepStatus={step.status} />
                        </div>
                        <span className="text-foreground/80 text-xs">{event.message}</span>
                      </div>
                    );
                  })}
              </li>
            );
          })}
        </ol>
      </div>
    </output>
  );
}
