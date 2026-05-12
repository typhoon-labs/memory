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
  Checkbox,
  DocumentContentViewer,
  formatAbsoluteTime,
  Input,
  ScrollArea,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  Textarea,
} from '@typhoon/ui';
import { PencilIcon, RefreshCwIcon, RotateCwIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Document } from './shared';
import { DOC_STATUS_MAP, formatBytes } from './shared';

interface DocumentContentResponse {
  document: { id: string };
  chunks: { text: string; startIndex: number | null }[];
}

export function DocumentDetailSheet({
  document: initialDocument,
  open,
  onOpenChange,
}: {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Fetch fresh document data so edits (title, description, metadata) are reflected immediately
  const { data: freshDocument } = useQuery<Document>({
    queryKey: ['document', initialDocument?.id ?? ''],
    queryFn: () => apiFetch(`/api/v1/documents/${initialDocument?.id}`),
    enabled: open && !!initialDocument,
    initialData: initialDocument ?? undefined,
  });

  if (!initialDocument) return null;

  const document = freshDocument ?? initialDocument;
  const hasError = document.status === 'parse_error' || document.status === 'embed_error';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        resizable
        className="overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="break-all">{document.title ?? document.sourceKey}</SheetTitle>
          <div className="mt-1">
            <StatusBadge variant={DOC_STATUS_MAP[document.status]}>{document.status.replace('_', ' ')}</StatusBadge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="px-4 pb-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <DetailsTab document={document} hasError={hasError} onClose={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="metadata" className="mt-4">
            <MetadataTab document={document} />
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
        <SectionLabel>File Properties</SectionLabel>
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

// =============================================================================
// Metadata types & utilities
// =============================================================================

interface MetadataFieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'string[]';
  required?: boolean;
  default?: unknown;
  allowedValues?: unknown[];
  description?: string;
}

type MetadataSchema = Record<string, MetadataFieldDefinition>;

interface MetadataTemplate {
  id: string;
  effectiveSchema: MetadataSchema;
}

interface SyncTargetInfo {
  id: string;
  metadataTemplateId: string | null;
}

/**
 * Coerce a string value to the proper type based on the field definition.
 * Custom fields (not in schema) pass through as strings.
 */
export function coerceMetadataValue(value: string, fieldDef: MetadataFieldDefinition | undefined): unknown {
  if (!fieldDef) return value;
  switch (fieldDef.type) {
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case 'boolean':
      return value === 'true';
    case 'string[]':
      return value
        ? value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    default:
      return value;
  }
}

// =============================================================================
// Metadata Tab
// =============================================================================

const TABLE_GRID = 'grid grid-cols-[10rem_1fr_2rem] items-center gap-2 px-3';

function MetadataTab({ document }: { document: Document }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title ?? '');
  const [description, setDescription] = useState(document.description ?? '');
  const [metadata, setMetadata] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(document.customMetadata ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [editingField, setEditingField] = useState<string | null>(null);

  // Fetch sync target to get metadataTemplateId
  const { data: syncTarget } = useQuery<SyncTargetInfo>({
    queryKey: ['sync-targets', document.syncTargetId],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${document.syncTargetId}`),
  });

  // Fetch template effective schema if template is assigned
  const { data: template } = useQuery<MetadataTemplate>({
    queryKey: ['metadata-templates', syncTarget?.metadataTemplateId],
    queryFn: () => apiFetch(`/api/v1/metadata-templates/${syncTarget?.metadataTemplateId}`),
    enabled: !!syncTarget?.metadataTemplateId,
  });

  const effectiveSchema = template?.effectiveSchema ?? {};

  // Reset form when document changes
  useEffect(() => {
    setTitle(document.title ?? '');
    setDescription(document.description ?? '');
    setMetadata(Object.fromEntries(Object.entries(document.customMetadata ?? {}).map(([k, v]) => [k, String(v)])));
    setEditingField(null);
  }, [document.title, document.description, document.customMetadata]);

  // Build template fields: all schema keys, populated from metadata or undefined
  const templateFields = useMemo(() => {
    const fields: Record<string, string | undefined> = {};
    for (const k of Object.keys(effectiveSchema)) {
      fields[k] = metadata[k] != null ? String(metadata[k]) : undefined;
    }
    return fields;
  }, [metadata, effectiveSchema]);

  const updateMutation = useMutation({
    mutationFn: (data: {
      title?: string | null;
      description?: string | null;
      customMetadata?: Record<string, unknown>;
    }) => apiFetch<Document>(`/api/v1/documents/${document.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updated: Document) => {
      queryClient.setQueryData(['document', document.id], updated);
      for (const key of [['documents'], ['browse']]) {
        queryClient.setQueriesData<Document[]>({ queryKey: key }, (old) =>
          old?.map((d) => (d.id === updated.id ? updated : d)),
        );
      }
    },
  });

  function updateMetadataField(key: string, value: string) {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    // Only send template-defined keys
    const templateMetadata: Record<string, unknown> = {};
    for (const key of Object.keys(effectiveSchema)) {
      if (metadata[key] != null) {
        templateMetadata[key] = coerceMetadataValue(metadata[key], effectiveSchema[key]);
      }
    }

    updateMutation.mutate({
      title: title || null,
      description: description || null,
      customMetadata: templateMetadata,
    });
  }

  const originalMetadata = useMemo(
    () => Object.fromEntries(Object.entries(document.customMetadata ?? {}).map(([k, v]) => [k, String(v)])),
    [document.customMetadata],
  );

  const hasChanges =
    title !== (document.title ?? '') ||
    description !== (document.description ?? '') ||
    JSON.stringify(metadata) !== JSON.stringify(originalMetadata);

  const hasTemplate = Object.keys(effectiveSchema).length > 0;

  const isEditingTitle = editingField === 'title';
  const isEditingDescription = editingField === 'description';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Title</SectionLabel>
          {!isEditingTitle && (
            <Button variant="ghost" size="icon-sm" onClick={() => setEditingField('title')}>
              <PencilIcon className="size-3" />
            </Button>
          )}
        </div>
        {isEditingTitle ? (
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null);
            }}
            placeholder="Document title"
            className="mt-1"
          />
        ) : (
          <button
            type="button"
            className="mt-1 block w-full cursor-pointer truncate text-left text-sm outline-none"
            onClick={() => setEditingField('title')}
          >
            {title || <span className="text-muted-foreground">No title</span>}
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Description</SectionLabel>
          {!isEditingDescription && (
            <Button variant="ghost" size="icon-sm" onClick={() => setEditingField('description')}>
              <PencilIcon className="size-3" />
            </Button>
          )}
        </div>
        {isEditingDescription ? (
          <Textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Escape') setEditingField(null);
            }}
            placeholder="Document description"
            rows={2}
            className="mt-1"
          />
        ) : (
          <button
            type="button"
            className="mt-1 block w-full cursor-pointer text-left text-sm outline-none"
            onClick={() => setEditingField('description')}
          >
            {description || <span className="text-muted-foreground">No description</span>}
          </button>
        )}
      </div>

      {/* Template Metadata */}
      {hasTemplate ? (
        <div>
          <SectionLabel>Metadata</SectionLabel>
          <div className="mt-2 rounded-lg border">
            <div
              className={`${TABLE_GRID} border-b py-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground`}
            >
              <span>Field</span>
              <span>Value</span>
              <span />
            </div>
            {Object.entries(templateFields).map(([key, value]) => {
              const fieldDef = effectiveSchema[key];
              return (
                <TemplateFieldRow
                  key={key}
                  fieldKey={key}
                  value={value}
                  fieldDef={fieldDef}
                  isEditing={editingField === `template:${key}`}
                  onStartEdit={() => setEditingField(`template:${key}`)}
                  onStopEdit={() => setEditingField(null)}
                  onChange={(v) => updateMetadataField(key, v)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No metadata template assigned to this sync source.</p>
      )}

      <Button onClick={handleSave} disabled={!hasChanges || updateMutation.isPending} className="w-full">
        <SaveIcon className="mr-1.5 size-3.5" />
        {updateMutation.isPending ? 'Saving...' : updateMutation.isSuccess ? 'Saved' : 'Save Changes'}
      </Button>
    </div>
  );
}

// =============================================================================
// Template Field Row
// =============================================================================

function TemplateFieldRow({
  fieldKey,
  value,
  fieldDef,
  isEditing,
  onStartEdit,
  onStopEdit,
  onChange,
}: {
  fieldKey: string;
  value: string | undefined;
  fieldDef: MetadataFieldDefinition;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') onStopEdit();
    if (e.key === 'Escape') onStopEdit();
  }

  // Boolean fields render as always-visible checkbox, no click-to-edit
  if (fieldDef.type === 'boolean') {
    return (
      <div className={`${TABLE_GRID} border-b py-2.5 last:border-b-0`}>
        <div>
          <span className="text-sm font-medium">
            {fieldKey}
            {fieldDef.required && '*'}
          </span>
          {fieldDef.description && <p className="mt-0.5 text-xs text-muted-foreground">{fieldDef.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === 'true'}
            onCheckedChange={(checked: boolean | 'indeterminate') => onChange(checked === true ? 'true' : 'false')}
          />
          <span className="text-sm text-muted-foreground">{value === 'true' ? 'Yes' : 'No'}</span>
        </div>
        <span />
      </div>
    );
  }

  // Fields with allowedValues render as a Select dropdown
  if (fieldDef.allowedValues && fieldDef.allowedValues.length > 0) {
    return (
      <div className={`${TABLE_GRID} border-b py-2.5 last:border-b-0`}>
        <div>
          <span className="text-sm font-medium">
            {fieldKey}
            {fieldDef.required && '*'}
          </span>
          {fieldDef.description && <p className="mt-0.5 text-xs text-muted-foreground">{fieldDef.description}</p>}
        </div>
        <Select value={value ?? ''} onValueChange={(v: string) => onChange(v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {fieldDef.allowedValues.map((av) => (
              <SelectItem key={String(av)} value={String(av)}>
                {String(av)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span />
      </div>
    );
  }

  // Default: click-to-edit text input
  return (
    <div className={`${TABLE_GRID} border-b py-2.5 last:border-b-0`}>
      <div>
        <span className="text-sm font-medium">
          {fieldKey}
          {fieldDef.required && '*'}
        </span>
        {fieldDef.description && <p className="mt-0.5 text-xs text-muted-foreground">{fieldDef.description}</p>}
      </div>
      {isEditing ? (
        <Input
          ref={inputRef}
          type={fieldDef.type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onStopEdit}
          onKeyDown={handleKeyDown}
          placeholder={fieldDef.type === 'string[]' ? 'Comma-separated values' : 'Enter value'}
          className="h-8 text-sm"
        />
      ) : (
        <button type="button" className="cursor-pointer truncate text-left text-sm outline-none" onClick={onStartEdit}>
          {value ? <span>{value}</span> : <span className="text-muted-foreground">&mdash;</span>}
        </button>
      )}
      <div className="flex justify-center">
        {!isEditing && (
          <Button variant="ghost" size="icon-sm" onClick={onStartEdit}>
            <PencilIcon className="size-3" />
          </Button>
        )}
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
