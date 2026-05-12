import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { apiFetch, Button, Input, Label, PageHeader, Separator, Textarea } from '@typhoon/ui';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

export function DatasetCreatePage() {
  usePageTitle('Create Dataset');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetch<{ id: string }>('/api/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-datasets'] });
      navigate({ to: '/datasets/$datasetId', params: { datasetId: data.id } });
    },
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/datasets" className="text-muted-foreground transition-colors hover:text-foreground">
                Datasets
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              Create
            </span>
          }
        />

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Details</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Basic information about this dataset.</p>
          </div>
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

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/datasets' })}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
