import { useQuery } from '@tanstack/react-query';
import type { StatusBadgeVariant } from '@typhoon/ui';
import { EmptyState, LoadingSpinner, PageHeader, StatusBadge } from '@typhoon/ui';
import { FileTextIcon } from 'lucide-react';

interface Document {
  id: string;
  s3Key: string;
  title: string | null;
  status: string;
  chunkCount: number;
  fileSize: number | null;
}

const STATUS_MAP: Record<string, StatusBadgeVariant> = {
  ready: 'success',
  processing: 'warning',
  pending: 'pending',
  parse_error: 'error',
  deleted: 'pending',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminDocumentsPage() {
  const { data: docs, isLoading } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/v1/documents', { credentials: 'include' }).then((r) => r.json()),
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Documents" description="All ingested documents and their processing status" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && docs && docs.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[600px] w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Chunks</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Size</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{doc.title ?? doc.s3Key}</div>
                      {doc.title && <div className="text-xs text-muted-foreground">{doc.s3Key}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={STATUS_MAP[doc.status] ?? 'pending'}>{doc.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{doc.chunkCount}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {doc.fileSize ? formatBytes(doc.fileSize) : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && docs?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<FileTextIcon className="size-8" />}
              title="No documents yet"
              description="Add a sync source to start ingesting documents."
            />
          </div>
        )}
      </div>
    </div>
  );
}
