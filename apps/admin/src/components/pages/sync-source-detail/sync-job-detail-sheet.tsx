import {
  formatAbsoluteTime,
  SectionLabel,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatCard,
  StatusBadge,
} from '@typhoon/ui';
import type { SyncJob } from './shared.js';
import { formatDuration, JOB_STATUS_MAP } from './shared.js';

export function SyncJobDetailSheet({
  job,
  open,
  onOpenChange,
}: {
  job: SyncJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            Sync Job
            <StatusBadge variant={JOB_STATUS_MAP[job.status]}>{job.status}</StatusBadge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* Timing */}
          <div>
            <SectionLabel>Timing</SectionLabel>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Started</dt>
                <dd className="mt-0.5">{formatAbsoluteTime(job.startedAt)}</dd>
              </div>
              {job.completedAt && (
                <div>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd className="mt-0.5">{formatAbsoluteTime(job.completedAt)}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-0.5">{formatDuration(job.startedAt, job.completedAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Error Message */}
          {job.status === 'failed' && job.errorMessage && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              <p className="mb-1 font-medium">Error Details</p>
              <p className="whitespace-pre-wrap">{job.errorMessage}</p>
            </div>
          )}

          {/* File Statistics */}
          <div>
            <SectionLabel>File Statistics</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <StatCard label="Scanned" value={job.filesScanned} />
              <StatCard label="New" value={job.filesNew} />
              <StatCard label="Updated" value={job.filesUpdated} />
              <StatCard label="Deleted" value={job.filesDeleted} />
              <StatCard
                label="Errors"
                value={job.filesErrored}
                className={job.filesErrored > 0 ? 'border-red-500/30' : ''}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
