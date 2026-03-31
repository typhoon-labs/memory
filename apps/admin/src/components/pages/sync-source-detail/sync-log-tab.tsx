import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@typhoon/ui';
import { DataTable, EmptyState, formatRelativeTime, StatusBadge } from '@typhoon/ui';
import { ClockIcon } from 'lucide-react';
import { useState } from 'react';
import type { SyncJob } from './shared.js';
import { formatDuration, JOB_STATUS_MAP } from './shared.js';
import { SyncJobDetailSheet } from './sync-job-detail-sheet.js';

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
    queryFn: () => fetch(`/api/v1/sync-targets/${sourceId}/jobs`, { credentials: 'include' }).then((r) => r.json()),
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
