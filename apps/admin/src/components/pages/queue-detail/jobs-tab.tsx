import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@typhoon/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  apiFetch,
  Button,
  DataTable,
  EmptyState,
  StatusBadge,
} from '@typhoon/ui';
import { EraserIcon, InboxIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { JobDetailSheet } from './job-detail-sheet';
import type { JobState, QueueJob } from './shared';
import { formatJobDuration, isStageProgress, JOB_STATE_BADGE_MAP } from './shared';

export function JobsTab({ queueName, jobState }: { queueName: string; jobState: JobState }) {
  const [selectedJob, setSelectedJob] = useState<QueueJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: jobs, isPending } = useQuery<QueueJob[]>({
    queryKey: ['queues', queueName, 'jobs', jobState],
    queryFn: () => apiFetch(`/api/v1/queues/${queueName}/jobs?state=${jobState}&pageSize=100`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch(`/api/v1/queues/${queueName}/jobs/${jobId}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch(`/api/v1/queues/${queueName}/jobs/${jobId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });

  const cleanMutation = useMutation({
    mutationFn: (state: 'completed' | 'failed') =>
      apiFetch(`/api/v1/queues/${queueName}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, grace: 0, limit: 5000 }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      const failedJobs = (jobs ?? []).filter((j) => j.state === 'failed');
      for (const job of failedJobs) {
        await apiFetch(`/api/v1/queues/${queueName}/jobs/${job.id}/retry`, {
          method: 'POST',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  const failedCount = (jobs ?? []).filter((j) => j.state === 'failed').length;
  const completedCount = (jobs ?? []).filter((j) => j.state === 'completed').length;

  const columns = useMemo<ColumnDef<QueueJob, unknown>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <code className="text-xs" title={row.original.id}>
            {row.original.id.slice(0, 8)}
          </code>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Job',
        cell: ({ row }) => {
          const stage =
            row.original.state === 'active' && isStageProgress(row.original.progress)
              ? row.original.progress.stage
              : null;
          // min-h reserves space for the optional stage sub-line so the row
          // height stays constant whether or not a stage is active —
          // otherwise rows jump when a job transitions states. Flex column
          // + justify-center keeps the single name line centered within
          // that reserved space so it aligns with the other cells (which
          // centre via the td align-middle in DataTable).
          return (
            <div className="flex min-h-[2.25rem] flex-col justify-center">
              <div className="font-medium">{row.original.name}</div>
              {stage && <div className="text-xs text-muted-foreground">↳ {stage}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: 'state',
        header: 'State',
        cell: ({ row }) => (
          <StatusBadge variant={JOB_STATE_BADGE_MAP[row.original.state] ?? 'pending'}>{row.original.state}</StatusBadge>
        ),
      },
      {
        accessorKey: 'attemptsMade',
        header: 'Attempts',
        cell: ({ row }) => <span className="tabular-nums">{row.original.attemptsMade}</span>,
      },
      {
        id: 'duration',
        accessorFn: (row) => {
          if (!row.processedOn) return -1;
          return (row.finishedOn ?? Date.now()) - row.processedOn;
        },
        header: 'Duration',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatJobDuration(row.original.processedOn, row.original.finishedOn)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: stop-propagation wrapper, not interactive
          // biome-ignore lint/a11y/noStaticElementInteractions: stop-propagation wrapper, not interactive
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                retryMutation.mutate(row.original.id);
              }}
              disabled={retryMutation.isPending || row.original.state !== 'failed'}
              title="Retry"
              className={row.original.state !== 'failed' ? 'invisible' : undefined}
              aria-hidden={row.original.state !== 'failed'}
            >
              <RotateCcwIcon className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  disabled={removeMutation.isPending}
                  title="Remove"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove job {row.original.id} from the queue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeMutation.mutate(row.original.id)}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ),
      },
    ],
    [retryMutation, removeMutation],
  );

  return (
    <>
      <div>
        {!isPending && jobs && jobs.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending}
              >
                <RotateCcwIcon className="mr-1.5 size-3.5" />
                Retry All Failed ({failedCount})
              </Button>
            )}
            {completedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cleanMutation.mutate('completed')}
                disabled={cleanMutation.isPending}
              >
                <EraserIcon className="mr-1.5 size-3.5" />
                Clean Completed ({completedCount})
              </Button>
            )}
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cleanMutation.mutate('failed')}
                disabled={cleanMutation.isPending}
              >
                <Trash2Icon className="mr-1.5 size-3.5" />
                Clean Failed ({failedCount})
              </Button>
            )}
          </div>
        )}
        {!isPending && jobs && jobs.length > 0 && (
          <DataTable
            data={jobs}
            columns={columns}
            pageSize={25}
            enableSorting
            showRowCount
            onRowClick={setSelectedJob}
          />
        )}

        {!isPending && jobs?.length === 0 && (
          <EmptyState
            icon={<InboxIcon className="size-8" />}
            title={`No ${jobState} jobs`}
            description={`There are no jobs in the ${jobState} state.`}
          />
        )}
      </div>

      <JobDetailSheet
        job={selectedJob}
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
      />

      <AlertDialog open={errorMessage !== null} onOpenChange={(open) => !open && setErrorMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot remove job</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorMessage(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
