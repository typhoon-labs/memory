import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
  EmptyState,
  formatRelativeTime,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@typhoon/ui';
import { DatabaseIcon, FileTextIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DocumentDetailSheet } from './sync-source-detail/document-detail-sheet';
import type { Document } from './sync-source-detail/shared';
import { DOC_STATUS_MAP, formatBytes } from './sync-source-detail/shared';

interface SyncTargetRecord {
  id: string;
  name: string;
  sourceType: string;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'ready', label: 'Ready' },
  { value: 'errors', label: 'Errors' },
  { value: 'processing', label: 'Processing' },
  { value: 'pending', label: 'Pending' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function AdminDocumentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { syncTargetId, status: statusFilter } = useSearch({ strict: false }) as {
    syncTargetId: string | undefined;
    status: StatusFilter;
  };
  const [selectedDocs, setSelectedDocs] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [textFilter, setTextFilter] = useState<string>('');

  const docsQueryKey = useMemo(
    () => (syncTargetId ? (['documents', { syncTargetId }] as const) : (['documents'] as const)),
    [syncTargetId],
  );

  const { data: docs } = useQuery<Document[]>({
    queryKey: docsQueryKey,
    queryFn: () => {
      const url = syncTargetId
        ? `/api/v1/documents?syncTargetId=${encodeURIComponent(syncTargetId)}`
        : '/api/v1/documents';
      return apiFetch(url);
    },
  });

  const { data: syncTargets } = useQuery<SyncTargetRecord[]>({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch('/api/v1/sync-targets'),
    staleTime: 60_000,
  });

  const targetMap = useMemo(() => {
    const m = new Map<string, SyncTargetRecord>();
    for (const t of syncTargets ?? []) m.set(t.id, t);
    return m;
  }, [syncTargets]);

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/v1/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedDocs([]);
    },
  });

  const filteredDocs = useMemo(() => {
    const needle = textFilter.trim().toLowerCase();
    const all = (docs ?? []).filter((d) => {
      if (d.status === 'deleted') return false;
      if (statusFilter === 'errors') {
        if (d.status !== 'parse_error' && d.status !== 'embed_error') return false;
      } else if (statusFilter !== 'all' && d.status !== statusFilter) {
        return false;
      }
      if (needle) {
        const targetName = targetMap.get(d.syncTargetId)?.name ?? '';
        const haystack = `${d.title ?? ''} ${d.sourceKey} ${targetName}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return all;
  }, [docs, statusFilter, textFilter, targetMap]);

  function setStatusFilter(next: StatusFilter) {
    navigate({ to: '/documents', search: { syncTargetId, status: next }, replace: true });
  }

  function setSyncTargetFilter(next: string | undefined) {
    navigate({ to: '/documents', search: { syncTargetId: next, status: statusFilter }, replace: true });
  }

  const columns: ColumnDef<Document, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title ?? row.original.sourceKey}</div>
            {row.original.title && <div className="text-xs text-muted-foreground">{row.original.sourceKey}</div>}
          </div>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => {
          const target = targetMap.get(row.original.syncTargetId);
          if (!target) return <span className="text-muted-foreground">&mdash;</span>;
          return (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <DatabaseIcon className="size-3 shrink-0" />
              {target.name}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant={DOC_STATUS_MAP[row.original.status] ?? 'pending'}>
            {row.original.status.replace('_', ' ')}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'chunkCount',
        header: 'Chunks',
        cell: ({ row }) => <span className="tabular-nums">{row.original.chunkCount}</span>,
      },
      {
        accessorKey: 'fileSize',
        header: 'Size',
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {row.original.fileSize ? formatBytes(row.original.fileSize) : '\u2014'}
          </span>
        ),
      },
      {
        accessorKey: 'lastSyncedAt',
        header: 'Last Synced',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastSyncedAt ? formatRelativeTime(row.original.lastSyncedAt) : '\u2014'}
          </span>
        ),
      },
    ],
    [targetMap],
  );

  const selectedSourceName = syncTargetId ? (targetMap.get(syncTargetId)?.name ?? null) : null;
  const description = selectedSourceName
    ? `Documents in ${selectedSourceName}`
    : 'All ingested documents across every sync source';

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Documents" description={description} />

        <div className="mt-6">
          <DataTable
            data={filteredDocs}
            columns={columns}
            pageSize={20}
            enableSorting
            enableRowSelection
            getRowId={(row) => row.id}
            onSelectionChange={setSelectedDocs}
            onRowClick={setSelectedDoc}
            showRowCount
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="h-8 w-[160px] text-sm">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={syncTargetId ?? '__all__'}
                  onValueChange={(v) => setSyncTargetFilter(v === '__all__' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 w-[200px] text-sm">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All sources</SelectItem>
                    {(syncTargets ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  {selectedDocs.length > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2Icon className="mr-1.5 size-3.5" />
                          Delete {selectedDocs.length}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {selectedDocs.length} documents?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the selected documents and their vectors.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedDocs.map((d) => d.id))}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Input
                    type="text"
                    placeholder="Filter documents..."
                    value={textFilter}
                    onChange={(e) => setTextFilter(e.target.value)}
                    className="h-8 w-[220px] text-sm"
                  />
                </div>
              </div>
            }
          />

          {filteredDocs.length === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={<FileTextIcon className="size-8" />}
                title="No documents"
                description={
                  statusFilter === 'all' && textFilter.trim() === ''
                    ? selectedSourceName
                      ? `No documents in ${selectedSourceName} yet.`
                      : 'Add a sync source to start ingesting documents.'
                    : 'No documents match the current filters.'
                }
              />
            </div>
          )}
        </div>

        <DocumentDetailSheet
          document={selectedDoc}
          open={selectedDoc !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedDoc(null);
          }}
        />
      </div>
    </div>
  );
}
