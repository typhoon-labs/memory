import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  DocumentContentViewer,
  formatAbsoluteTime,
  ScrollArea,
  SectionLabel,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@typhoon/ui';
import { RefreshCwIcon, RotateCwIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Document } from './shared';
import { DOC_STATUS_MAP, formatBytes } from './shared';

interface DocumentContentResponse {
  document: { id: string };
  chunks: { text: string; startIndex: number | null }[];
}

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
      <SheetContent resizable className="overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle className="break-all">{document.title ?? document.sourceKey}</SheetTitle>
          <div className="mt-1">
            <StatusBadge variant={DOC_STATUS_MAP[document.status]}>{document.status.replace('_', ' ')}</StatusBadge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="px-4 pb-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <DetailsTab document={document} hasError={hasError} onClose={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="content" className="mt-4">
            <ContentTab documentId={document.id} mimeType={document.mimeType} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function DetailsTab({ document, hasError, onClose }: { document: Document; hasError: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/documents/${document.id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
  });

  const resyncMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/documents/${document.id}/resync`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });

  // After a successful re-sync, briefly show "Re-sync queued" then reset
  // the button so the user can re-trigger it (or so it reflects the next
  // status the doc transitions into).
  useEffect(() => {
    if (!resyncMutation.isSuccess) return;
    const timer = setTimeout(() => resyncMutation.reset(), 2500);
    return () => clearTimeout(timer);
  }, [resyncMutation.isSuccess, resyncMutation.reset]);

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/documents/${document.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      onClose();
    },
  });

  return (
    <div className="space-y-5">
      {/* Description */}
      {document.description && <p className="text-sm leading-relaxed text-muted-foreground">{document.description}</p>}

      {/* Error Message */}
      {hasError && document.errorMessage && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <p className="mb-1 font-medium">Error Details</p>
          <p className="whitespace-pre-wrap">{document.errorMessage}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {hasError && (
          <Button variant="outline" size="sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            {retryMutation.isPending ? 'Retrying...' : 'Retry'}
          </Button>
        )}

        {document.status === 'ready' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resyncMutation.mutate()}
            disabled={resyncMutation.isPending || resyncMutation.isSuccess}
          >
            <RotateCwIcon className="mr-1.5 size-3.5" />
            {resyncMutation.isSuccess ? 'Re-sync queued' : resyncMutation.isPending ? 'Re-syncing...' : 'Re-sync'}
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={deleteMutation.isPending}>
              <Trash2Icon className="mr-1.5 size-3.5" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the document, its vectors, and the source file.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Metadata */}
      <div>
        <SectionLabel>Metadata</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <dt className="text-muted-foreground">Source Key</dt>
            <dd className="mt-0.5 break-all font-mono text-xs">{document.sourceKey}</dd>
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
  );
}

function ContentTab({ documentId, mimeType }: { documentId: string; mimeType: string | null }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleAnchorClick = useCallback((id: string) => {
    const target = contentRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    // Find the nearest actually-scrollable ancestor (scrollHeight > clientHeight)
    let scrollable: HTMLElement | null = target.parentElement as HTMLElement | null;
    while (scrollable) {
      if (scrollable.scrollHeight > scrollable.clientHeight && getComputedStyle(scrollable).overflowY !== 'visible') {
        break;
      }
      scrollable = scrollable.parentElement as HTMLElement | null;
    }
    if (scrollable) {
      const elRect = target.getBoundingClientRect();
      const vpRect = scrollable.getBoundingClientRect();
      scrollable.scrollTo({
        top: scrollable.scrollTop + (elRect.top - vpRect.top) - 80,
        behavior: 'smooth',
      });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const { data, isLoading } = useQuery<DocumentContentResponse>({
    queryKey: ['document-content', documentId],
    queryFn: () => apiFetch(`/api/v1/documents/${documentId}/chunks`),
  });

  const { data: parsedData } = useQuery<{ text: string }>({
    queryKey: ['document-parsed', documentId],
    queryFn: () => apiFetch(`/api/v1/documents/${documentId}/parsed-content`),
  });

  const fullText = useMemo(() => {
    if (parsedData?.text) return parsedData.text;
    if (!data?.chunks) return '';
    return data.chunks.map((c) => c.text).join('\n\n');
  }, [data, parsedData]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!fullText) {
    return <p className="text-sm text-muted-foreground">No content available.</p>;
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div ref={contentRef} className="text-sm leading-relaxed">
        <DocumentContentViewer text={fullText} mimeType={mimeType} onAnchorClick={handleAnchorClick} />
      </div>
    </ScrollArea>
  );
}
