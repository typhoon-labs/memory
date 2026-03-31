import { formatAbsoluteTime, SectionLabel, Sheet, SheetContent, SheetHeader, SheetTitle, StatusBadge } from '@typhoon/ui';
import type { Document } from './shared.js';
import { DOC_STATUS_MAP, formatBytes } from './shared.js';

export function DocumentDetailSheet({
  document,
  open,
  onOpenChange,
}: {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!document) return null;

  const hasError = document.status === 'parse_error' || document.status === 'embed_error';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-all">{document.title ?? document.s3Key}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <StatusBadge variant={DOC_STATUS_MAP[document.status]}>{document.status.replace('_', ' ')}</StatusBadge>
          </div>

          {/* Error Message */}
          {hasError && document.errorMessage && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              <p className="mb-1 font-medium">Error Details</p>
              <p className="whitespace-pre-wrap">{document.errorMessage}</p>
            </div>
          )}

          {/* Metadata */}
          <div>
            <SectionLabel>Metadata</SectionLabel>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <dt className="text-muted-foreground">S3 Key</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{document.s3Key}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">MIME Type</dt>
                <dd className="mt-0.5">{document.mimeType ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">File Size</dt>
                <dd className="mt-0.5 tabular-nums">{document.fileSize ? formatBytes(document.fileSize) : '\u2014'}</dd>
              </div>
              {document.author && (
                <div>
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="mt-0.5">{document.author}</dd>
                </div>
              )}
              {document.pageCount != null && (
                <div>
                  <dt className="text-muted-foreground">Pages</dt>
                  <dd className="mt-0.5 tabular-nums">{document.pageCount}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Chunks</dt>
                <dd className="mt-0.5 tabular-nums">{document.chunkCount}</dd>
              </div>
              {document.contentHash && (
                <div>
                  <dt className="text-muted-foreground">Content Hash</dt>
                  <dd className="mt-0.5 truncate font-mono text-xs">{document.contentHash}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Timestamps */}
          <div>
            <SectionLabel>Timestamps</SectionLabel>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="mt-0.5">{formatAbsoluteTime(document.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5">{formatAbsoluteTime(document.updatedAt)}</dd>
              </div>
              {document.lastSyncedAt && (
                <div>
                  <dt className="text-muted-foreground">Last Synced</dt>
                  <dd className="mt-0.5">{formatAbsoluteTime(document.lastSyncedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
