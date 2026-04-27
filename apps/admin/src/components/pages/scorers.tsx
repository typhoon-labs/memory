import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  type StatusBadgeVariant,
  Textarea,
} from '@typhoon/ui';
import { GaugeIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Scorer {
  id: string;
  status: 'draft' | 'active' | 'archived';
  name: string | null;
  type: string | null;
  description: string | null;
  versionNumber: number | null;
  updatedAt: string;
}

interface ScorersResponse {
  scorers: Scorer[];
  total: number;
}

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  active: 'success',
  draft: 'pending',
  archived: 'warning',
};

const TYPE_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness',
  hallucination: 'Hallucination',
  answerRelevancy: 'Answer Relevancy',
  contextRelevance: 'Context Relevance',
  contextPrecision: 'Context Precision',
  custom: 'Custom (LLM Judge)',
};

const SCORER_TYPES = [
  { value: 'faithfulness', label: 'Faithfulness' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'answerRelevancy', label: 'Answer Relevancy' },
  { value: 'contextRelevance', label: 'Context Relevance' },
  { value: 'contextPrecision', label: 'Context Precision' },
  { value: 'custom', label: 'Custom (LLM Judge)' },
];

const columns: ColumnDef<Scorer, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <div className="font-medium">{row.original.name ?? '\u2014'}</div>,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {TYPE_LABELS[row.original.type ?? ''] ?? row.original.type ?? '\u2014'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'pending'}>{row.original.status}</StatusBadge>
    ),
  },
  {
    accessorKey: 'versionNumber',
    header: 'Version',
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {row.original.versionNumber != null ? `v${row.original.versionNumber}` : '\u2014'}
      </span>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.updatedAt)}</span>,
  },
];

type StatusFilter = 'all' | 'draft' | 'active' | 'archived';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export function ScorersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status } = useSearch({ strict: false }) as { status: StatusFilter };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('faithfulness');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  function setStatus(next: StatusFilter) {
    navigate({ to: '/scorers', search: { status: next }, replace: true });
  }

  const { data, isLoading } = useQuery<ScorersResponse>({
    queryKey: ['admin-scorers', status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      const qs = params.toString();
      return apiFetch(`/api/v1/admin/scorers${qs ? `?${qs}` : ''}`);
    },
  });

  const scorers = useMemo(() => {
    const all = data?.scorers ?? [];
    if (!searchText.trim()) return all;
    const q = searchText.toLowerCase();
    return all.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q),
    );
  }, [data, searchText]);

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetch('/api/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          description: description.trim() || undefined,
          instructions: type === 'custom' ? instructions.trim() || undefined : undefined,
        }),
      });
    },
    onSuccess: (data: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorers'] });
      setDialogOpen(false);
      setName('');
      setType('faithfulness');
      setDescription('');
      setInstructions('');
      navigate({ to: '/scorers/$scorerId', params: { scorerId: data.id } });
    },
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Scorers"
          description="Manage scoring definitions for automated quality evaluation"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="mr-2 size-4" />
                  Create Scorer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Scorer</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="scorer-name">Name</Label>
                    <Input
                      id="scorer-name"
                      placeholder="e.g. tone-checker"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="scorer-type">Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger id="scorer-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCORER_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="scorer-description">Description (optional)</Label>
                    <Textarea
                      id="scorer-description"
                      placeholder="What does this scorer evaluate?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                  {type === 'custom' && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="scorer-instructions">Instructions</Label>
                      <Textarea
                        id="scorer-instructions"
                        placeholder="Evaluation criteria for the LLM judge..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        rows={4}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create'}
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

        {!isLoading && data && (
          <div className="mt-6">
            {data.scorers.length === 0 && status === 'all' && !searchText ? (
              <EmptyState
                icon={<GaugeIcon className="size-8" />}
                title="No scorers yet"
                description="Create one to start evaluating agent responses."
              />
            ) : (
              <DataTable
                data={scorers}
                columns={columns}
                enableSorting
                getRowId={(row) => row.id}
                onRowClick={(row) => navigate({ to: '/scorers/$scorerId', params: { scorerId: row.id } })}
                showRowCount
                toolbar={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                      <SelectTrigger className="h-8 w-[160px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FILTER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="ml-auto">
                      <Input
                        placeholder="Search scorers..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="h-8 w-[220px] text-sm"
                      />
                    </div>
                  </div>
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
