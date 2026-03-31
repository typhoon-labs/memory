import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
  LoadingSpinner,
  PageHeader,
  StatusBadge,
} from '@typhoon/ui';
import { FolderSyncIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { SyncTarget } from './sync-source-detail/shared.js';
import { formatConfig } from './sync-source-detail/shared.js';

const columns: ColumnDef<SyncTarget, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground">{row.original.sourceType}</div>
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
      <span className="text-sm text-muted-foreground">
        {formatConfig(row.original.sourceType, row.original.config)}
      </span>
    ),
  },
  {
    accessorKey: 'cronSchedule',
    header: 'Schedule',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.cronSchedule}</span>,
  },
  {
    accessorKey: 'managedBy',
    header: 'Managed',
    cell: ({ row }) => (row.original.managedBy === 'config' ? <StatusBadge variant="info">Config</StatusBadge> : null),
  },
];

export function SyncSourcesPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: targets, isLoading } = useQuery<SyncTarget[]>({
    queryKey: ['sync-targets'],
    queryFn: () => fetch('/api/v1/sync-targets', { credentials: 'include' }).then((r) => r.json()),
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Sync Sources"
          description="Manage document ingestion sources"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="mr-2 size-4" />
                  Add Source
                </Button>
              </DialogTrigger>
              <DialogContent>
                <AddSourceForm onDone={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
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

function AddSourceForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    sourceType: 's3',
    source: 's3-default',
    bucket: '',
    prefix: '',
  });

  const create = useMutation({
    mutationFn: () =>
      fetch('/api/v1/sync-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name,
          sourceType: form.sourceType,
          source: form.source,
          config: { bucket: form.bucket, prefix: form.prefix },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets'] });
      onDone();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Sync Source</DialogTitle>
        <DialogDescription>Configure a new source for document ingestion.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-name">Name</Label>
          <Input
            id="source-name"
            placeholder="e.g. Product Docs"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-credential">Source</Label>
          <Input
            id="source-credential"
            placeholder="e.g. s3-default"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-bucket">Bucket</Label>
          <Input
            id="source-bucket"
            placeholder="e.g. my-docs-bucket"
            value={form.bucket}
            onChange={(e) => setForm({ ...form, bucket: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-prefix">Prefix (optional)</Label>
          <Input
            id="source-prefix"
            placeholder="e.g. docs/"
            value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!form.name || !form.bucket || create.isPending}>
          {create.isPending ? 'Creating...' : 'Create'}
        </Button>
      </DialogFooter>
    </>
  );
}
