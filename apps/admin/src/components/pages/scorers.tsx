import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  DataTable,
  EmptyState,
  formatRelativeTime,
  Input,
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
import { GaugeIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

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
  usePageTitle('Scorers');
  const navigate = useNavigate();
  const { status } = useSearch({ strict: false }) as { status: StatusFilter };
  const [searchText, setSearchText] = useState('');

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

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Scorers"
          description="Manage scoring definitions for automated quality evaluation"
          actions={
            <Button asChild>
              <Link to="/scorers/create">
                <PlusIcon className="mr-2 size-4" />
                Create Scorer
              </Link>
            </Button>
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
                    <div className="relative ml-auto">
                      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="h-8 w-[220px] pl-8 text-sm"
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
