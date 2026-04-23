import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  type StatusBadgeVariant,
} from '@typhoon/ui';
import { FlaskConicalIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

// ---------- Types ----------

interface Experiment {
  id: string;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  datasetId: string;
  totalItems: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ExperimentListResponse {
  experiments: Experiment[];
  total: number;
}

interface Dataset {
  id: string;
  name: string;
}

// ---------- Helpers ----------

const STATUS_VARIANT: Record<Experiment['status'], StatusBadgeVariant> = {
  pending: 'pending',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

// ---------- Run Experiment Dialog ----------

function RunExperimentForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState('');

  const { data: datasets } = useQuery<{ datasets: Dataset[] }>({
    queryKey: ['admin-datasets'],
    queryFn: () => apiFetch('/api/v1/admin/datasets'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, name: name || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-experiments'] });
      onDone();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Run Experiment</DialogTitle>
        <DialogDescription>Evaluate agent quality against a dataset.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="experiment-name">Name (optional)</Label>
          <Input
            id="experiment-name"
            placeholder="e.g. Baseline v2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Dataset</Label>
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets?.datasets?.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!datasetId || create.isPending}>
          {create.isPending ? 'Starting...' : 'Run'}
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------- Main Page ----------

export function ExperimentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<ExperimentListResponse>({
    queryKey: ['admin-experiments'],
    queryFn: () => apiFetch('/api/v1/admin/experiments'),
  });

  const handleDelete = useCallback(
    async (experiment: Experiment) => {
      await apiFetch(`/api/v1/admin/experiments/${experiment.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin-experiments'] });
    },
    [queryClient],
  );

  const columns: ColumnDef<Experiment, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="max-w-[240px] truncate font-medium">
            {row.original.name || (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.id.slice(0, 12)}</code>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</StatusBadge>
        ),
      },
      {
        id: 'progress',
        header: 'Progress',
        cell: ({ row }) => {
          const { succeeded, failed, totalItems } = row.original;
          const processed = (succeeded ?? 0) + (failed ?? 0);
          return (
            <span className="tabular-nums">
              {processed} / {totalItems}
            </span>
          );
        },
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
              <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                <Trash2Icon className="size-3.5 text-muted-foreground" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete experiment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this experiment and all its results.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(row.original)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Experiments"
          description="Evaluate agent quality against datasets"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlayIcon className="mr-2 size-4" />
                  Run Experiment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <RunExperimentForm onDone={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          }
        />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && data?.experiments && data.experiments.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={data.experiments}
              columns={columns}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/experiments/$experimentId', params: { experimentId: row.id } })}
              showRowCount
            />
          </div>
        )}

        {!isLoading && data?.experiments?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<FlaskConicalIcon className="size-8" />}
              title="No experiments yet"
              description="Run one to evaluate agent quality."
            />
          </div>
        )}
      </div>
    </div>
  );
}
