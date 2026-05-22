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

export interface SourceDefinition {
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
}

export function SyncSourceCreatePage() {
  usePageTitle('Add Source');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: sources } = useQuery<SourceDefinition[]>({
    queryKey: ['sources'],
    queryFn: () => apiFetch('/api/v1/sources'),
  });

  const [form, setForm] = useState({
    name: '',
    source: '',
    config: {} as Record<string, string>,
  });

  const selectedSource = sources?.find((s) => s.name === form.source);
  const sourceType = selectedSource?.sourceType;
  const sourceBucket = typeof selectedSource?.config?.bucket === 'string' ? selectedSource.config.bucket : undefined;

  const handleSourceChange = (value: string) => {
    setForm({ ...form, source: value, config: {} });
  };

  const setConfig = (key: string, value: string) => {
    setForm({ ...form, config: { ...form.config, [key]: value } });
  };

  const isValid = form.name && form.source && sourceType;

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/api/v1/sync-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          sourceType,
          source: form.source,
          config: sourceType === 's3' ? { prefix: form.config.prefix ?? '' } : form.config,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets'] });
      navigate({ to: '/sources/$sourceId', params: { sourceId: data.id } });
    },
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/sources" className="text-muted-foreground hover:text-foreground transition-colors">
                Sync Sources
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              Add Source
            </span>
          }
        />

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Details</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Name this sync target and select the source connector.
            </p>
          </div>
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
            <Label>Source</Label>
            <Select value={form.source} onValueChange={handleSourceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                {sources?.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} <span className="text-muted-foreground">({s.sourceType})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceType === 's3' && (
            <>
              <div className="pt-4">
                <h2 className="text-sm font-semibold">S3 Configuration</h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Syncing from bucket <span className="font-mono font-medium">{sourceBucket ?? 'unknown'}</span>.
                  Optionally scope to a key prefix.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="source-prefix">Prefix (optional)</Label>
                <Input
                  id="source-prefix"
                  placeholder="e.g. docs/"
                  value={form.config.prefix ?? ''}
                  onChange={(e) => setConfig('prefix', e.target.value)}
                />
              </div>
            </>
          )}

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/sources' })}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!isValid || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
