import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, DataTable, EmptyState, LoadingSpinner, PageHeader, StatusBadge } from '@typhoon/ui';
import { ListChecksIcon } from 'lucide-react';

import { usePageTitle } from '../../hooks/use-page-title';
import type { QueueSummary } from './queue-detail/shared';

const columns: ColumnDef<QueueSummary, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Queue',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    id: 'status',
    accessorFn: (row) => (row.isPaused ? 'paused' : 'active'),
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge variant={row.original.isPaused ? 'pending' : 'success'}>
        {row.original.isPaused ? 'Paused' : 'Active'}
      </StatusBadge>
    ),
  },
  {
    id: 'waiting',
    accessorFn: (row) => row.counts.waiting,
    header: 'Waiting',
    cell: ({ row }) => <span className="tabular-nums">{row.original.counts.waiting}</span>,
  },
  {
    id: 'active',
    accessorFn: (row) => row.counts.active,
    header: 'Active',
    cell: ({ row }) => <span className="tabular-nums">{row.original.counts.active}</span>,
  },
  {
    id: 'failed',
    accessorFn: (row) => row.counts.failed,
    header: 'Failed',
    cell: ({ row }) => (
      <span className={`tabular-nums ${row.original.counts.failed > 0 ? 'font-medium text-red-400' : ''}`}>
        {row.original.counts.failed}
      </span>
    ),
  },
  {
    id: 'completed',
    accessorFn: (row) => row.counts.completed,
    header: 'Completed',
    cell: ({ row }) => <span className="tabular-nums">{row.original.counts.completed}</span>,
  },
  {
    id: 'delayed',
    accessorFn: (row) => row.counts.delayed,
    header: 'Delayed',
    cell: ({ row }) => <span className="tabular-nums">{row.original.counts.delayed}</span>,
  },
];

export function QueuesPage() {
  usePageTitle('Queues');
  const navigate = useNavigate();

  const { data: queues, isLoading } = useQuery<QueueSummary[]>({
    queryKey: ['queues'],
    queryFn: () => apiFetch('/api/v1/queues'),
    refetchInterval: 60_000,
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Queues" description="Monitor and manage background job queues" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && queues && queues.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={queues}
              columns={columns}
              onRowClick={(queue) => navigate({ to: '/queues/$queueName', params: { queueName: queue.name } })}
              enableSorting
              showRowCount
            />
          </div>
        )}

        {!isLoading && queues?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<ListChecksIcon className="size-8" />}
              title="No queues"
              description="No job queues have been initialized."
            />
          </div>
        )}
      </div>
    </div>
  );
}
