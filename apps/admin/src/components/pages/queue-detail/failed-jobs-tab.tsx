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
  formatRelativeTime,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@typhoon/ui';
import { ArchiveIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';

interface FailedJob {
  id: string;
  queue: string;
  jobName: string;
  jobId: string;
  data: unknown;
  failedReason: string | null;
  stacktrace: string | null;
  attemptsMade: number;
  syncTargetId: string | null;
  documentId: string | null;
  createdAt: string;
}

export function FailedJobsTab({ queueName }: { queueName: string }) {
  const [selectedJob, setSelectedJob] = useState<FailedJob | null>(null);
  const queryClient = useQueryClient();

  const { data: jobs, isPending } = useQuery<FailedJob[]>({
    queryKey: ['queues', 'failed-jobs', queueName],
    queryFn: () => apiFetch(`/api/v1/queues/failed-jobs?queue=${queueName}&limit=100`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/queues/failed-jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', 'failed-jobs'] });
    },
  });

  const columns = useMemo<ColumnDef<FailedJob, unknown>[]>(
    () => [
      {
        accessorKey: 'jobId',
        header: 'Job ID',
        cell: ({ row }) => <code className="text-xs">{row.original.jobId}</code>,
      },
      {
        accessorKey: 'jobName',
        header: 'Type',
        cell: ({ row }) => <span className="font-medium">{row.original.jobName}</span>,
      },
      {
        accessorKey: 'failedReason',
        header: 'Error',
        cell: ({ row }) => (
          <span className="text-muted-foreground max-w-xs truncate text-xs" title={row.original.failedReason ?? ''}>
            {row.original.failedReason ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'attemptsMade',
        header: 'Attempts',
        cell: ({ row }) => <span className="tabular-nums">{row.original.attemptsMade}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Failed At',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">{formatRelativeTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stop-propagation wrapper
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  disabled={removeMutation.isPending}
                  title="Delete"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete archived failure?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove this failure record.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeMutation.mutate(row.original.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ),
      },
    ],
    [removeMutation],
  );

  return (
    <>
      <div>
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
            icon={<ArchiveIcon className="size-8" />}
            title="No archived failures"
            description="Terminal job failures are archived here permanently for debugging."
          />
        )}
      </div>

      <Sheet open={selectedJob !== null} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedJob && (
            <>
              <SheetHeader>
                <SheetTitle>
                  Failed Job: {selectedJob.jobName} ({selectedJob.jobId})
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <Section label="Error">{selectedJob.failedReason ?? '-'}</Section>
                <Section label="Attempts">{String(selectedJob.attemptsMade)}</Section>
                <Section label="Failed At">{new Date(selectedJob.createdAt).toLocaleString()}</Section>
                {selectedJob.syncTargetId && <Section label="Sync Target">{selectedJob.syncTargetId}</Section>}
                {selectedJob.documentId && <Section label="Document">{selectedJob.documentId}</Section>}
                {selectedJob.data !== undefined && selectedJob.data !== null && (
                  <Section label="Job Data">
                    <pre className="bg-muted mt-1 max-h-40 overflow-auto rounded p-2 text-xs">
                      {JSON.stringify(selectedJob.data, null, 2)}
                    </pre>
                  </Section>
                )}
                {selectedJob.stacktrace && (
                  <Section label="Stacktrace">
                    <pre className="bg-muted mt-1 max-h-60 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                      {selectedJob.stacktrace}
                    </pre>
                  </Section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
