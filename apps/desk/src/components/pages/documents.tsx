import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { DocumentViewerPanel, documentContentQuery, documentParsedQuery } from '@typhoon/chat';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  cn,
  DataTable,
  EmptyState,
  formatRelativeTime,
  Input,
  LoadingSpinner,
  PageHeader,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  useUrlSearchInput,
} from '@typhoon/ui';
import { DatabaseIcon, FileTextIcon, SearchIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

interface Document {
  id: string;
  syncTargetId: string;
  sourceKey: string;
  title: string | null;
  mimeType: string | null;
  status: string;
  fileSize: number | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

interface SyncTargetRecord {
  id: string;
  name: string;
  sourceType: string;
}

// ── Helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_BUCKETS: Record<string, readonly string[]> = {
  PDF: ['application/pdf'],
  Word: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  Markdown: ['text/markdown', 'text/x-markdown'],
  Spreadsheet: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ],
  Text: ['text/plain', 'text/html'],
};

const TYPE_BUCKET_ORDER = ['PDF', 'Word', 'Markdown', 'Spreadsheet', 'Text'] as const;

function classifyMime(mimeType: string | null): string | null {
  if (!mimeType) return null;
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  for (const bucket of TYPE_BUCKET_ORDER) {
    if (TYPE_BUCKETS[bucket]?.includes(normalized)) return bucket;
  }
  return 'Other';
}

// ── Component ──────────────────────────────────────────────────

export function DocumentsPage() {
  const navigate = useNavigate();
  const { source, type, filter, doc } = useSearch({ strict: false }) as {
    source: string | undefined;
    type: string | undefined;
    filter: string | undefined;
    doc: string | undefined;
  };

  const sourceFilter = source ?? '__all__';
  const typeFilter = type ?? '__all__';
  const selectedDocId = doc ?? null;

  usePageTitle('Documents');

  const setSourceFilter = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, source: v === '__all__' ? undefined : v }), replace: true });
  const setTypeFilter = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, type: v === '__all__' ? undefined : v }), replace: true });

  const {
    inputValue: textFilter,
    setInputValue: setTextFilter,
    handleKeyDown: textFilterKeyDown,
    handleBlur: textFilterBlur,
  } = useUrlSearchInput({
    urlValue: filter,
    onCommit: (val) => navigate({ search: (prev) => ({ ...prev, filter: val }), replace: true }),
  });

  const queryClient = useQueryClient();

  const prefetchDocument = useCallback(
    (doc: Document) => {
      queryClient.prefetchQuery(documentContentQuery(doc.id));
      queryClient.prefetchQuery(documentParsedQuery(doc.id));
    },
    [queryClient],
  );

  const { data: docs, isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => apiFetch<Document[]>('/api/v1/documents'),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((d) => d.status === 'pending' || d.status === 'processing') ? 3000 : false;
    },
  });

  const { data: syncTargets, isLoading: targetsLoading } = useQuery<SyncTargetRecord[]>({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch<SyncTargetRecord[]>('/api/v1/sync-targets'),
    staleTime: 60_000,
  });

  const targetMap = useMemo(() => {
    const m = new Map<string, SyncTargetRecord>();
    for (const t of syncTargets ?? []) m.set(t.id, t);
    return m;
  }, [syncTargets]);

  const filteredDocs = useMemo(() => {
    const needle = textFilter.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      if (d.status === 'deleted') return false;
      if (sourceFilter !== '__all__' && d.syncTargetId !== sourceFilter) return false;
      if (typeFilter !== '__all__' && classifyMime(d.mimeType) !== typeFilter) return false;
      if (needle) {
        const targetName = targetMap.get(d.syncTargetId)?.name ?? '';
        const haystack = `${d.title ?? ''} ${d.sourceKey} ${targetName}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [docs, sourceFilter, typeFilter, textFilter, targetMap]);

  const isLoading = docsLoading || targetsLoading;
  const isFiltering = sourceFilter !== '__all__' || typeFilter !== '__all__' || textFilter.trim() !== '';
  const totalDocsCount = (docs ?? []).filter((d) => d.status !== 'deleted').length;

  const columns: ColumnDef<Document, unknown>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => `${row.title ?? ''} ${row.sourceKey}`,
        cell: ({ row }) => (
          <div className={cn('min-w-0', row.original.status !== 'ready' && 'opacity-60')}>
            <div className="truncate font-medium">{row.original.title ?? row.original.sourceKey}</div>
            {row.original.title && (
              <div className="truncate text-xs text-muted-foreground">{row.original.sourceKey}</div>
            )}
          </div>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        accessorFn: (row) => targetMap.get(row.syncTargetId)?.name ?? '',
        cell: ({ row }) => {
          const target = targetMap.get(row.original.syncTargetId);
          if (!target) return <span className="text-muted-foreground">{'\u2014'}</span>;
          return (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <DatabaseIcon className="size-3 shrink-0" />
              {target.name}
            </span>
          );
        },
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (row) => classifyMime(row.mimeType) ?? '',
        cell: ({ row }) => {
          const bucket = classifyMime(row.original.mimeType);
          return <span className="text-muted-foreground">{bucket ?? '\u2014'}</span>;
        },
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
        id: 'updated',
        header: 'Updated',
        accessorFn: (row) => row.lastSyncedAt ?? row.updatedAt,
        cell: ({ row }) => {
          const doc = row.original;
          if (doc.status === 'pending' || doc.status === 'processing') {
            return <StatusBadge variant="warning">Processing</StatusBadge>;
          }
          if (doc.status === 'parse_error' || doc.status === 'embed_error') {
            return <StatusBadge variant="error">Unavailable</StatusBadge>;
          }
          const ts = doc.lastSyncedAt ?? doc.updatedAt;
          return <span className="text-muted-foreground">{formatRelativeTime(ts)}</span>;
        },
      },
    ],
    [targetMap],
  );

  const browsePanel = (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className={selectedDocId ? '' : 'mx-auto max-w-5xl'}>
        <PageHeader title="Documents" description="All documents available to ask questions about" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && (
          <div className="mt-6">
            <DataTable
              data={filteredDocs}
              columns={columns}
              pageSize={20}
              enableSorting
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ search: (prev) => ({ ...prev, doc: row.id }), replace: true })}
              onRowHover={prefetchDocument}
              showRowCount
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
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
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All types</SelectItem>
                      {TYPE_BUCKET_ORDER.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative ml-auto">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search..."
                      value={textFilter}
                      onChange={(e) => setTextFilter(e.target.value)}
                      onKeyDown={textFilterKeyDown}
                      onBlur={textFilterBlur}
                      className="h-8 w-[220px] pl-8 text-sm"
                    />
                  </div>
                </div>
              }
            />

            {filteredDocs.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={<FileTextIcon className="size-8" />}
                  title={
                    isFiltering ? 'No matching documents' : totalDocsCount === 0 ? 'No documents yet' : 'No documents'
                  }
                  description={
                    isFiltering
                      ? 'Try adjusting your filters.'
                      : totalDocsCount === 0
                        ? 'No sync sources are configured.'
                        : ''
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!selectedDocId) {
    return <div className="h-full">{browsePanel}</div>;
  }

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize={50} minSize={20} className="hidden lg:block">
        {browsePanel}
      </ResizablePanel>
      <ResizableHandle withHandle className="hidden lg:flex" />
      <ResizablePanel defaultSize={50} minSize={30}>
        <DocumentViewerPanel
          key={selectedDocId}
          documentId={selectedDocId}
          searchTerms={[]}
          onClose={() => navigate({ search: (prev) => ({ ...prev, doc: undefined }), replace: true })}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
