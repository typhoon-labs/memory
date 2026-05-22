import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, Button, DataTable, EmptyState, LoadingSpinner, PageHeader, StatusBadge } from '@typhoon/ui';
import { FolderSyncIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';

import { usePageTitle } from '../../hooks/use-page-title';
import type { SourceDefinition } from './sync-source-create';
import type { SyncTarget } from './sync-source-detail/shared';
import { formatConfig } from './sync-source-detail/shared';

function useSourceBucketMap(sources: SourceDefinition[] | undefined) {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sources ?? []) {
      const bucket = s.config?.bucket;
      if (typeof bucket === 'string') map.set(s.name, bucket);
    }
    return map;
  }, [sources]);
}

export function SyncSourcesPage() {
  usePageTitle('Sources');
  const navigate = useNavigate();

  const { data: targets, isLoading } = useQuery<SyncTarget[]>({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch('/api/v1/sync-targets'),
  });

  const { data: sources } = useQuery<SourceDefinition[]>({
    queryKey: ['sources'],
    queryFn: () => apiFetch('/api/v1/sources'),
  });

  const bucketMap = useSourceBucketMap(sources);

  const columns: ColumnDef<SyncTarget, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-muted-foreground text-xs">{row.original.sourceType}</div>
          </div>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant={row.original.isActive ? 'success' : 'pending'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        ),
      },
      {
        id: 'path',
        header: 'Path',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatConfig(row.original.sourceType, row.original.config, bucketMap.get(row.original.source ?? ''))}
          </span>
        ),
      },
      {
        accessorKey: 'cronSchedule',
        header: 'Schedule',
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.cronSchedule}</span>,
      },
      {
        accessorKey: 'managedBy',
        header: 'Managed',
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.managedBy ?? '\u2014'}</span>,
      },
    ],
    [bucketMap],
  );

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Sync Sources"
          description="Manage document ingestion sources"
          actions={
            <Button asChild>
              <Link to="/sources/create">
                <PlusIcon className="mr-2 size-4" />
                Add Source
              </Link>
            </Button>
          }
        />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && targets && targets.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={targets}
              columns={columns}
              onRowClick={(target) => navigate({ to: '/sources/$sourceId', params: { sourceId: target.id } })}
              enableSorting
              showRowCount
            />
          </div>
        )}

        {!isLoading && targets?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<FolderSyncIcon className="size-8" />}
              title="No sync sources"
              description="Add a source to start ingesting documents."
            />
          </div>
        )}
      </div>
    </div>
  );
}
