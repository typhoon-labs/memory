import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  formatRelativeTime,
  Input,
  Label,
  LoadingSpinner,
  PageHeader,
  Textarea,
} from '@typhoon/ui';
import { DatabaseIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  version: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DatasetsResponse {
  datasets: Dataset[];
}

function buildColumns(onDelete: (dataset: Dataset) => void): ColumnDef<Dataset, unknown>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <div className="max-w-[180px] truncate font-medium">{row.original.name}</div>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <div className="max-w-[160px] truncate text-sm text-muted-foreground">
          {row.original.description ?? '\u2014'}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="-my-1 size-6 rounded" onClick={(e) => e.stopPropagation()}>
              <Trash2Icon className="size-3 text-muted-foreground" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete dataset?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{row.original.name}&rdquo; and all its test cases.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(row.original)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];
}

export function DatasetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data, isLoading } = useQuery<DatasetsResponse>({
    queryKey: ['admin-datasets'],
    queryFn: () => apiFetch('/api/v1/admin/datasets'),
  });

  const datasets = useMemo(() => data?.datasets ?? [], [data]);

  const handleDelete = useCallback(
    async (dataset: Dataset) => {
      await apiFetch(`/api/v1/admin/datasets/${dataset.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets'] });
    },
    [queryClient],
  );

  const columns = useMemo(() => buildColumns(handleDelete), [handleDelete]);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await apiFetch('/api/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets'] });
      setName('');
      setDescription('');
      setDialogOpen(false);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Datasets"
          description="Manage evaluation datasets and test cases"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="mr-2 size-4" />
                  Create Dataset
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Dataset</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dataset-name">Name</Label>
                    <Input
                      id="dataset-name"
                      placeholder="e.g. Customer Support Q&A"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dataset-description">Description (optional)</Label>
                    <Textarea
                      id="dataset-description"
                      placeholder="Describe what this dataset is for..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
                    {isCreating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && datasets.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={datasets}
              columns={columns}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/datasets/$datasetId', params: { datasetId: row.id } })}
              showRowCount
            />
          </div>
        )}

        {!isLoading && datasets.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<DatabaseIcon className="size-8" />}
              title="No datasets yet"
              description="Create one to build evaluation test cases."
            />
          </div>
        )}
      </div>
    </div>
  );
}
