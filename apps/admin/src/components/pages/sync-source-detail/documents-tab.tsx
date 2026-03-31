import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@typhoon/ui';
import { Button, DataTable, EmptyState, formatRelativeTime, StatusBadge } from '@typhoon/ui';
import { FileTextIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DocumentDetailSheet } from './document-detail-sheet.js';
import type { Document } from './shared.js';
import { DOC_STATUS_MAP, formatBytes } from './shared.js';

const STATUS_FILTERS = ['all', 'ready', 'errors', 'processing', 'pending'] as const;

const columns: ColumnDef<Document, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Name',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.title ?? row.original.s3Key}</div>
        {row.original.title && <div className="text-xs text-muted-foreground">{row.original.s3Key}</div>}
      </div>
    ),
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
];

export function DocumentsTab({ sourceId }: { sourceId: string }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');

  const { data: docs, isLoading } = useQuery<Document[]>({
    queryKey: ['documents', { syncTargetId: sourceId }],
    queryFn: () =>
      fetch(`/api/v1/documents?syncTargetId=${sourceId}`, { credentials: 'include' }).then((r) => r.json()),
  });

  const filteredDocs = useMemo(() => {
    if (!docs) return [];
    if (statusFilter === 'all') return docs.filter((d) => d.status !== 'deleted');
    if (statusFilter === 'errors') return docs.filter((d) => d.status === 'parse_error' || d.status === 'embed_error');
    return docs.filter((d) => d.status === statusFilter);
  }, [docs, statusFilter]);

  return (
    <>
      <DataTable
        data={filteredDocs}
        columns={columns}
        pageSize={20}
        enableFiltering
        enableSorting
        showRowCount
        onRowClick={setSelectedDoc}
        toolbar={
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f}
                variant={statusFilter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
        }
      />

      {!isLoading && filteredDocs.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<FileTextIcon className="size-8" />}
            title="No documents"
            description={
              statusFilter === 'all'
                ? 'No documents have been synced yet.'
                : `No documents with status "${statusFilter}".`
            }
          />
        </div>
      )}

      <DocumentDetailSheet
        document={selectedDoc}
        open={selectedDoc !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSelectedDoc(null);
        }}
      />
    </>
  );
}
