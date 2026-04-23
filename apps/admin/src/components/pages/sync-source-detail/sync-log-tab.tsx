import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, DataTable, EmptyState, formatRelativeTime, StatusBadge } from '@typhoon/ui';
import { ClockIcon } from 'lucide-react';
import { useState } from 'react';
import type { SyncJob } from './shared';
import { formatDuration, JOB_STATUS_MAP } from './shared';
import { SyncJobDetailSheet } from './sync-job-detail-sheet';

const columns: ColumnDef<SyncJob, unknown>[] = [
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge variant={JOB_STATUS_MAP[row.original.status] ?? 'pending'}>{row.original.status}</StatusBadge>
    ),
  },
  {
    accessorKey: 'startedAt',
    header: 'Started',
    cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.startedAt)}</span>,
  },
  {
    id: 'duration',
    header: 'Duration',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDuration(row.original.startedAt, row.original.completedAt)}</span>
    ),
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row }) => {
      const { status, childJobsTotal, childJobsCompleted } = row.original;
      if (childJobsTotal === 0) return <span className="text-muted-foreground">-</span>;
      const pct = Math.round((childJobsCompleted / childJobsTotal) * 100);
      return (
        <span className={`tabular-nums ${status === 'running' ? 'text-amber-400' : ''}`}>
          {childJobsCompleted}/{childJobsTotal} ({pct}%)
        </span>
      );
    },
  },
  {
    accessorKey: 'filesScanned',
    header: 'Scanned',
    cell: ({ row }) => <span className="tabular-nums">{row.original.filesScanned}</span>,
  },
  {
    accessorKey: 'filesNew',
    header: 'New',
    cell: ({ row }) => <span className="tabular-nums">{row.original.filesNew}</span>,
  },
  {
    accessorKey: 'filesUpdated',
    header: 'Updated',
    cell: ({ row }) => <span className="tabular-nums">{row.original.filesUpdated}</span>,
  },
  {
    accessorKey: 'filesDeleted',
    header: 'Deleted',
    cell: ({ row }) => <span className="tabular-nums">{row.original.filesDeleted}</span>,
  },
  {
    accessorKey: 'filesErrored',
    header: 'Errors',
    cell: ({ row }) => (
      <span className={`tabular-nums ${row.original.filesErrored > 0 ? 'font-medium text-red-400' : ''}`}>
        {row.original.filesErrored}
      </span>
    ),
  },
];

export function SyncLogTab({ sourceId }: { sourceId: string }) {
  const [selectedJob, setSelectedJob] = useState<SyncJob | null>(null);

  const { data: jobs, isLoading } = useQuery<SyncJob[]>({
    queryKey: ['sync-targets', sourceId, 'jobs'],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}/jobs`),
  });

  const sortedJobs = jobs
    ? [...jobs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    : [];

  return (
    <>
      {sortedJobs.length > 0 ? (
        <DataTable
          data={sortedJobs}
          columns={columns}
          pageSize={15}
          enableSorting
          showRowCount
          onRowClick={setSelectedJob}
        />
      ) : (
        !isLoading && (
          <EmptyState
            icon={<ClockIcon className="size-8" />}
            title="No sync jobs"
            description="No sync jobs have been run yet. Click 'Sync Now' to start one."
          />
        )
      )}

      <SyncJobDetailSheet
        job={selectedJob}
        open={selectedJob !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSelectedJob(null);
        }}
      />
    </>
  );
}
