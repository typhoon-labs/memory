import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@typhoon/ui';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

interface Dataset {
  id: string;
  name: string;
}

export function ExperimentCreatePage() {
  usePageTitle('Run Experiment');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState('');

  const { data: datasets } = useQuery<{ datasets: Dataset[] }>({
    queryKey: ['admin-datasets'],
    queryFn: () => apiFetch('/api/v1/admin/datasets'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/api/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, name: name || undefined }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-experiments'] });
      navigate({ to: '/experiments/$experimentId', params: { experimentId: data.id } });
    },
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/experiments" className="text-muted-foreground transition-colors hover:text-foreground">
                Experiments
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              Run Experiment
            </span>
          }
        />

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Configuration</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Choose a dataset and optionally name this experiment run.
            </p>
          </div>
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

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/experiments' })}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!datasetId || createMutation.isPending}>
              {createMutation.isPending ? 'Starting...' : 'Run'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
