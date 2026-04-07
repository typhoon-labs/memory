import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Button,
  DataTable,
  SectionLabel,
  StatCard,
} from '@typhoon/ui';
import { AlertTriangleIcon, CheckCircleIcon, ClockIcon, LoaderIcon, PauseCircleIcon } from 'lucide-react';
import type { QueueSummary, QueueWorker } from './shared.js';
import { formatSeconds } from './shared.js';

const workerColumns: ColumnDef<QueueWorker, unknown>[] = [
  {
    accessorKey: 'addr',
    header: 'Address',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.addr}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.name}</span>,
  },
  {
    accessorKey: 'age',
    header: 'Uptime',
    cell: ({ row }) => <span className="text-xs tabular-nums">{formatSeconds(row.original.age)}</span>,
  },
  {
    accessorKey: 'idle',
    header: 'Idle',
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">{formatSeconds(row.original.idle)}</span>
    ),
  },
];

export function OverviewTab({ queue }: { queue: QueueSummary }) {
  const queryClient = useQueryClient();

  const { data: workers } = useQuery<QueueWorker[]>({
    queryKey: ['queues', queue.name, 'workers'],
    queryFn: () => fetch(`/api/v1/queues/${queue.name}/workers`, { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const cleanMutation = useMutation({
    mutationFn: ({ state, limit }: { state: string; limit: number }) =>
      fetch(`/api/v1/queues/${queue.name}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ state, grace: 0, limit }),
      }).then((r) => {
        if (!r.ok) throw new Error('Clean failed');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Job counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Waiting" value={queue.counts.waiting} icon={<ClockIcon className="size-4" />} />
        <StatCard label="Active" value={queue.counts.active} icon={<LoaderIcon className="size-4" />} />
        <StatCard label="Completed" value={queue.counts.completed} icon={<CheckCircleIcon className="size-4" />} />
        <StatCard label="Failed" value={queue.counts.failed} icon={<AlertTriangleIcon className="size-4" />} />
        <StatCard label="Delayed" value={queue.counts.delayed} icon={<PauseCircleIcon className="size-4" />} />
      </div>

      {/* Workers */}
      <div>
        <SectionLabel>Workers ({workers?.length ?? 0})</SectionLabel>
        {workers && workers.length > 0 ? (
          <div className="mt-2">
            <DataTable data={workers} columns={workerColumns} pageSize={10} enableSorting />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No workers connected.</p>
        )}
      </div>

      {/* Clean actions */}
      <div>
        <SectionLabel>Maintenance</SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={queue.counts.completed === 0 || cleanMutation.isPending}>
                Clean Completed ({queue.counts.completed})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clean completed jobs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {queue.counts.completed} completed jobs from the queue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cleanMutation.mutate({ state: 'completed', limit: queue.counts.completed })}
                >
                  Clean
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={queue.counts.failed === 0 || cleanMutation.isPending}>
                Clean Failed ({queue.counts.failed})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clean failed jobs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {queue.counts.failed} failed jobs from the queue. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cleanMutation.mutate({ state: 'failed', limit: queue.counts.failed })}
                >
                  Clean
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
