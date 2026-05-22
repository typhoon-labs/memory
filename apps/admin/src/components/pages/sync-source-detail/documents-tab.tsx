import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { queryKeys } from '@typhoon/api-client';
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
  EmptyState,
  formatRelativeTime,
  Input,
  LoadingSpinner,
  StatusBadge,
} from '@typhoon/ui';
import {
  ArrowRightIcon,
  Edit2Icon,
  EraserIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CreateFolderDialog } from './create-folder-dialog';
import {
  DraggableFileRow,
  DragOverlayContent,
  DroppableBreadcrumb,
  DroppableFolderRow,
  MoveErrorBanner,
} from './dnd-components';
import { DocumentDetailSheet } from './document-detail-sheet';
import type { Document, SyncTarget } from './shared';
import { DOC_STATUS_MAP, formatBytes } from './shared';
import { UploadDialog } from './upload-dialog';
import { computeDestination, type DragItem, isDescendantOf, useFileMove } from './use-file-move';

// ── Recent activity row count for non-S3 sources ────────────────

const RECENT_ACTIVITY_LIMIT = 25;

// ── Types for browse response ───────────────────────────────��───

interface BrowseFile {
  sourceKey: string;
  size: number;
  lastModified: string;
  document: Document | null;
}

interface BrowseResponse {
  path: string;
  folders: string[];
  files: BrowseFile[];
}

// ── Main component ──────────────────────────────────────────────

export function DocumentsTab({
  sourceId,
  sourceType,
  browsePath,
  onBrowsePathChange,
}: {
  sourceId: string;
  sourceType?: string;
  browsePath?: string;
  onBrowsePathChange?: (path: string) => void;
}) {
  if (sourceType === 's3') {
    return <S3FileBrowser sourceId={sourceId} browsePath={browsePath ?? ''} onBrowsePathChange={onBrowsePathChange} />;
  }
  return <RecentActivityPanel sourceId={sourceId} />;
}

// ── Recent activity panel for non-S3 sources ────────────────────
//
// The full document table lives at /documents (filterable, sortable, with
// bulk actions). This panel exists so the sync-source detail tab still has
// something useful for non-S3 sources at a glance — the most recent
// ingestion activity for *this* source — without re-implementing the global
// table in miniature.

type RecentSortKey = 'name' | 'status' | 'size' | 'lastSynced';
type SortDir = 'asc' | 'desc';

// Reusable sortable header cell — shared by both the recent-activity panel
// and the S3 file browser. Mirrors the styling and interaction of
// DataTable's built-in sortable headers (packages/ui/src/components/DataTable.tsx)
// so admin tables look consistent across the app: th-level click, Unicode
// arrow indicator, no inline button or icon component.
function SortableTh({
  children,
  align,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const indicator = active ? (dir === 'asc' ? '\u2191' : '\u2193') : '';
  return (
    <th
      className={`text-2xs text-muted-foreground cursor-pointer px-4 py-2.5 font-semibold tracking-widest uppercase select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <span className="inline-block w-3 text-center">{indicator}</span>
      </span>
    </th>
  );
}

function RecentActivityPanel({ sourceId }: { sourceId: string }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [sortKey, setSortKey] = useState<RecentSortKey>('lastSynced');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: docs, isLoading } = useQuery<Document[]>({
    queryKey: ['documents', { syncTargetId: sourceId }],
    queryFn: () => apiFetch(`/api/v1/documents?syncTargetId=${sourceId}`),
  });

  // Always pick the 25 most-recently-synced docs first; sort below only
  // reorders that fixed set so the panel keeps its "recent activity" framing.
  const recentSet = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => d.status !== 'deleted')
        .toSorted((a, b) => {
          const at = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
          const bt = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
          return bt - at;
        })
        .slice(0, RECENT_ACTIVITY_LIMIT),
    [docs],
  );

  const recent = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...recentSet].toSorted((a, b) => {
      switch (sortKey) {
        case 'name': {
          const an = (a.title ?? a.sourceKey).toLowerCase();
          const bn = (b.title ?? b.sourceKey).toLowerCase();
          return an < bn ? -1 * dir : an > bn ? 1 * dir : 0;
        }
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'size':
          return ((a.fileSize ?? 0) - (b.fileSize ?? 0)) * dir;
        case 'lastSynced': {
          const at = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
          const bt = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
          return (at - bt) * dir;
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [recentSet, sortKey, sortDir]);

  const toggleSort = (key: RecentSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Sensible default per column: numerics + dates start desc, text starts asc.
    setSortDir(key === 'lastSynced' || key === 'size' ? 'desc' : 'asc');
  };

  const totalActive = (docs ?? []).filter((d) => d.status !== 'deleted').length;
  const hasMore = totalActive > recent.length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Recent activity</h3>
          <p className="text-muted-foreground text-xs">
            Most recently synced documents in this source
            {totalActive > 0 ? ` \u2014 ${totalActive} total` : ''}
          </p>
        </div>
        <Link
          to="/documents"
          search={{ syncTargetId: sourceId, status: 'all' as const }}
          className="text-primary text-xs hover:underline"
        >
          View all in Documents
          <ArrowRightIcon className="ml-1 inline size-3" />
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && recent.length > 0 && (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="divide-border min-w-full divide-y text-sm">
            <thead className="border-border border-b">
              <tr>
                <SortableTh align="left" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')}>
                  Name
                </SortableTh>
                <SortableTh
                  align="left"
                  active={sortKey === 'status'}
                  dir={sortDir}
                  onClick={() => toggleSort('status')}
                >
                  Status
                </SortableTh>
                <SortableTh align="right" active={sortKey === 'size'} dir={sortDir} onClick={() => toggleSort('size')}>
                  Size
                </SortableTh>
                <SortableTh
                  align="right"
                  active={sortKey === 'lastSynced'}
                  dir={sortDir}
                  onClick={() => toggleSort('lastSynced')}
                >
                  Last Synced
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-border bg-card divide-y">
              {recent.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{doc.title ?? doc.sourceKey}</div>
                    {doc.title && <div className="text-muted-foreground text-xs">{doc.sourceKey}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge variant={DOC_STATUS_MAP[doc.status] ?? 'pending'}>
                      {doc.status.replace('_', ' ')}
                    </StatusBadge>
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                    {doc.fileSize ? formatBytes(doc.fileSize) : '\u2014'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-muted-foreground">
                      {doc.lastSyncedAt ? formatRelativeTime(doc.lastSyncedAt) : '\u2014'}
                    </span>
                    {doc.searchMetaDirty && (
                      <span className="ml-1.5 inline-flex align-middle" title="Needs sync">
                        <RefreshCwIcon className="size-3 text-amber-500" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="border-border bg-muted text-muted-foreground border-t px-4 py-2 text-center text-xs">
              Showing {recent.length} of {totalActive} {'\u2014'}{' '}
              <Link
                to="/documents"
                search={{ syncTargetId: sourceId, status: 'all' as const }}
                className="text-primary hover:underline"
              >
                view all
              </Link>
            </div>
          )}
        </div>
      )}

      {!isLoading && recent.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<FileTextIcon className="size-8" />}
            title="No documents"
            description="No documents have been synced yet."
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

// ── S3 File Browser ─────────────────────────────────────────────

const S3_PAGE_SIZE = 25;

function S3FileBrowser({
  sourceId,
  browsePath,
  onBrowsePathChange,
}: {
  sourceId: string;
  browsePath: string;
  onBrowsePathChange?: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const currentPath = browsePath;
  const setCurrentPath = useCallback(
    (path: string) => {
      onBrowsePathChange?.(path);
    },
    [onBrowsePathChange],
  );
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ items: DragItem[]; originPath: string } | null>(null);
  // Inline rename state. `renamingKey` is the row currently in rename mode
  // (the file's sourceKey or the folder's path); null when nothing is being
  // renamed. `renameError` surfaces a per-rename error inline below the input.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  // Folders always render before files. Sorting reorders within each
  // group by the chosen column. Folders only have a "name" they can sort
  // by — for status/size columns the folder block keeps its current order.
  const [s3SortKey, setS3SortKey] = useState<'name' | 'status' | 'size' | 'lastSynced'>('name');
  const [s3SortDir, setS3SortDir] = useState<SortDir>('asc');
  const toggleS3Sort = (key: 'name' | 'status' | 'size' | 'lastSynced') => {
    if (s3SortKey === key) {
      setS3SortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setS3SortKey(key);
    setS3SortDir(key === 'size' || key === 'lastSynced' ? 'desc' : 'asc');
  };

  const { moveItems, isPending: isMovePending, error: moveError, clearError: clearMoveError } = useFileMove(sourceId);

  const { data, isLoading } = useQuery<BrowseResponse>({
    queryKey: queryKeys.syncTargets.browse(sourceId, currentPath),
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}/browse?path=${encodeURIComponent(currentPath)}`),
  });

  // The parent sync-source-detail page already fetches the target with this
  // exact key, so this is served from React Query's cache with no extra
  // network roundtrip. We only need it to label the root breadcrumb.
  const { data: target } = useQuery<SyncTarget>({
    queryKey: ['sync-targets', sourceId],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}`),
  });

  const rootLabel = useMemo(() => {
    if (!target) return '/';
    const config = target.config;
    const bucket = typeof config.bucket === 'string' ? config.bucket : undefined;
    if (!bucket) return '/';
    const rawPrefix = typeof config.prefix === 'string' ? config.prefix : '';
    const prefix = rawPrefix.replace(/\/$/, '');
    // No trailing slash on the label — the slash separator below provides
    // the visual break between the root and the first nested segment.
    return prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`;
  }, [target]);

  const sortedFolders = useMemo(() => {
    if (!data?.folders) return [];
    // Folders only meaningfully sort by name — for status/size they preserve
    // the API's order so folders don't shuffle around when the user clicks
    // a column that doesn't apply to them.
    if (s3SortKey !== 'name') return [...data.folders];
    const dir = s3SortDir === 'asc' ? 1 : -1;
    return [...data.folders].toSorted((a, b) => {
      const an = (a.replace(currentPath, '').replace(/\/$/, '') || a).toLowerCase();
      const bn = (b.replace(currentPath, '').replace(/\/$/, '') || b).toLowerCase();
      return an < bn ? -1 * dir : an > bn ? 1 * dir : 0;
    });
  }, [data, currentPath, s3SortKey, s3SortDir]);

  const sortedFiles = useMemo(() => {
    if (!data?.files) return [];
    const dir = s3SortDir === 'asc' ? 1 : -1;
    return [...data.files].toSorted((a, b) => {
      switch (s3SortKey) {
        case 'name': {
          const an = (a.document?.title ?? a.sourceKey.split('/').pop() ?? a.sourceKey).toLowerCase();
          const bn = (b.document?.title ?? b.sourceKey.split('/').pop() ?? b.sourceKey).toLowerCase();
          return an < bn ? -1 * dir : an > bn ? 1 * dir : 0;
        }
        case 'status': {
          // Untracked files (no document) sort to the bottom regardless of dir.
          const as = a.document?.status ?? '\uffff';
          const bs = b.document?.status ?? '\uffff';
          return as.localeCompare(bs) * dir;
        }
        case 'size':
          return ((a.size ?? 0) - (b.size ?? 0)) * dir;
        case 'lastSynced': {
          const at = a.document?.lastSyncedAt ? new Date(a.document.lastSyncedAt).getTime() : 0;
          const bt = b.document?.lastSyncedAt ? new Date(b.document.lastSyncedAt).getTime() : 0;
          return (at - bt) * dir;
        }
        default:
          return 0;
      }
    });
  }, [data, s3SortKey, s3SortDir]);

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/v1/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedItems(new Set());
    },
  });

  const bulkPurgeMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/v1/documents/bulk-purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      setSelectedItems(new Set());
    },
  });

  const resyncSelectedMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/v1/documents/${id}/resync`, { method: 'POST' })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0 && failed === ids.length) throw new Error(`All ${failed} resync requests failed`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      setSelectedItems(new Set());
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (path: string) =>
      apiFetch(`/api/v1/sync-targets/${sourceId}/folders/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedItems(new Set());
    },
  });

  // ── Rename mutations ──
  // Both endpoints already accept the move payload format used by the
  // dialogs we're replacing; rename is simply "move where the parent path
  // is unchanged."

  const renameFileMutation = useMutation({
    mutationFn: ({ documentId, newSourceKey }: { documentId: string; newSourceKey: string }) =>
      apiFetch(`/api/v1/documents/${documentId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSourceKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setRenamingKey(null);
      setRenameError(null);
    },
    onError: (err: Error) => {
      setRenameError(err.message);
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      apiFetch(`/api/v1/sync-targets/${sourceId}/folders/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setRenamingKey(null);
      setRenameError(null);
    },
    onError: (err: Error) => {
      setRenameError(err.message);
    },
  });

  // Cancel rename mode without committing.
  const cancelRename = useCallback(() => {
    setRenamingKey(null);
    setRenameError(null);
  }, []);

  // Commit a file rename. No-op if the basename is unchanged or empty.
  const commitFileRename = (file: BrowseFile, rawNewName: string) => {
    const trimmed = rawNewName.trim();
    const oldBasename = file.sourceKey.split('/').pop() ?? file.sourceKey;
    if (!trimmed || trimmed === oldBasename) {
      cancelRename();
      return;
    }
    if (!file.document) {
      cancelRename();
      return;
    }
    const parentPath = file.sourceKey.slice(0, file.sourceKey.length - oldBasename.length);
    renameFileMutation.mutate({
      documentId: file.document.id,
      newSourceKey: `${parentPath}${trimmed}`,
    });
  };

  // Commit a folder rename. No-op if the folder name is unchanged or empty.
  const commitFolderRename = (folderPath: string, rawNewName: string) => {
    const trimmed = rawNewName.trim();
    const cleaned = folderPath.replace(/\/$/, '');
    const oldName = cleaned.split('/').pop() ?? cleaned;
    if (!trimmed || trimmed === oldName) {
      cancelRename();
      return;
    }
    const parentPath = cleaned.slice(0, cleaned.length - oldName.length);
    renameFolderMutation.mutate({
      oldPath: folderPath,
      newPath: `${parentPath}${trimmed}/`,
    });
  };

  // F2 keyboard shortcut: rename the single selected item, if any.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'F2') return;
      if (selectedItems.size !== 1) return;
      const key = [...selectedItems][0];
      if (!key) return;
      e.preventDefault();
      setRenamingKey(key);
      setRenameError(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItems]);

  // Reset page when navigating, sorting, filtering, or changing path
  useEffect(() => setPage(0), [currentPath, s3SortKey, s3SortDir, filter]);

  // Filter + paginate files (folders always show in full)
  const filteredFiles = useMemo(() => {
    if (!filter) return sortedFiles;
    const lc = filter.toLowerCase();
    return sortedFiles.filter((f) => {
      const name = f.document?.title ?? f.sourceKey.split('/').pop() ?? f.sourceKey;
      return name.toLowerCase().includes(lc);
    });
  }, [sortedFiles, filter]);

  const totalFiles = filteredFiles.length;
  const totalPages = Math.max(1, Math.ceil(totalFiles / S3_PAGE_SIZE));
  const pagedFiles = filteredFiles.slice(page * S3_PAGE_SIZE, (page + 1) * S3_PAGE_SIZE);

  // Selected document IDs (files with an associated document record)
  const selectedDocIds = useMemo(() => {
    const ids: string[] = [];
    for (const key of selectedItems) {
      if (key.endsWith('/')) continue;
      const file = data?.files.find((f) => f.sourceKey === key);
      if (file?.document?.id) ids.push(file.document.id);
    }
    return ids;
  }, [selectedItems, data]);

  // Breadcrumb segments
  const pathSegments = currentPath ? currentPath.replace(/\/$/, '').split('/') : [];

  const toggleItem = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Select-all over every visible row (folders + files). Indeterminate when
  // some — but not all — visible items are selected.
  const allItemKeys = useMemo(
    () => [...sortedFolders, ...sortedFiles.map((f) => f.sourceKey)],
    [sortedFolders, sortedFiles],
  );
  const allSelected = allItemKeys.length > 0 && allItemKeys.every((k) => selectedItems.has(k));
  const someSelected = !allSelected && allItemKeys.some((k) => selectedItems.has(k));
  const selectAllState: boolean | 'indeterminate' = allSelected ? true : someSelected ? 'indeterminate' : false;
  const toggleSelectAll = () => {
    setSelectedItems(allSelected ? new Set() : new Set(allItemKeys));
  };

  const handleDelete = () => {
    const docIds: string[] = [];
    const folderPaths: string[] = [];

    for (const key of selectedItems) {
      if (key.endsWith('/')) {
        folderPaths.push(key);
      } else {
        const file = data?.files.find((f) => f.sourceKey === key);
        if (file?.document) docIds.push(file.document.id);
      }
    }

    if (docIds.length > 0) bulkDeleteMutation.mutate(docIds);
    for (const path of folderPaths) deleteFolderMutation.mutate(path);
  };

  // Convert a key from selectedItems/browse data into a DragItem
  const keyToDragItem = useCallback(
    (key: string): DragItem | null => {
      if (key.endsWith('/')) {
        return { type: 'folder', path: key };
      }
      const file = data?.files.find((f) => f.sourceKey === key);
      if (!file?.document) return null;
      return { type: 'file', sourceKey: key, documentId: file.document.id, title: file.document.title };
    },
    [data],
  );

  // Drag-and-drop handlers
  const handleDragStart = useCallback(
    (event: { operation: { source: { id: string | number } | null } }) => {
      const source = event.operation.source;
      if (!source) return;
      const draggedId = String(source.id);
      let items: DragItem[];

      if (selectedItems.has(draggedId)) {
        // Dragging a selected item — drag all selected
        items = [...selectedItems].map(keyToDragItem).filter((item): item is DragItem => item !== null);
      } else {
        // Dragging an unselected item — drag only it
        const item = keyToDragItem(draggedId);
        if (!item) return;
        items = [item];
        setSelectedItems(new Set([draggedId]));
      }

      setActiveDrag({ items, originPath: currentPath });
    },
    [selectedItems, keyToDragItem, currentPath],
  );

  const handleDragEnd = useCallback(
    (event: { canceled: boolean; operation: { target: { id: string | number } | null } }) => {
      const target = event.operation.target;
      if (event.canceled || !target || !activeDrag) {
        setActiveDrag(null);
        return;
      }

      const targetId = String(target.id);
      // Resolve target path from the droppable id
      let targetPath: string;
      if (targetId === 'breadcrumb-root') {
        targetPath = '';
      } else if (targetId.startsWith('breadcrumb-')) {
        targetPath = targetId.replace('breadcrumb-', '');
      } else if (targetId.startsWith('drop-')) {
        // Folder drop target — id is "drop-<folderPath>"
        targetPath = targetId.replace('drop-', '');
      } else {
        setActiveDrag(null);
        return;
      }

      const { items } = activeDrag;

      // Validate: no folder dropped onto itself or descendant
      for (const item of items) {
        if (item.type === 'folder') {
          if (targetPath === item.path || isDescendantOf(targetPath, item.path)) {
            setActiveDrag(null);
            return;
          }
        }
      }

      // Validate: no-op if dropping onto current parent
      const allAlreadyHere = items.every((item) => {
        const dest = computeDestination(item, targetPath);
        return item.type === 'file' ? dest === item.sourceKey : dest === item.path;
      });
      if (allAlreadyHere) {
        setActiveDrag(null);
        return;
      }

      moveItems(items, targetPath);
      setActiveDrag(null);
      setSelectedItems(new Set());
    },
    [activeDrag, moveItems],
  );

  const dragDisabled = isMovePending;
  const draggedIds = new Set(activeDrag?.items.map((i) => (i.type === 'file' ? i.sourceKey : i.path)) ?? []);
  const selectedCount = selectedItems.size;

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Error banner */}
      <MoveErrorBanner error={moveError} onDismiss={clearMoveError} />

      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <DroppableBreadcrumb
          id="breadcrumb-root"
          path=""
          disabled={currentPath === '' || dragDisabled}
          onClick={() => {
            setCurrentPath('');
            setSelectedItems(new Set());
          }}
        >
          {rootLabel}
        </DroppableBreadcrumb>
        {pathSegments.map((segment, i) => {
          const segmentPath = `${pathSegments.slice(0, i + 1).join('/')}/`;
          const isLast = i === pathSegments.length - 1;
          return (
            <span key={segmentPath} className="flex items-center gap-1">
              <span className="text-muted-foreground select-none">/</span>
              <DroppableBreadcrumb
                id={`breadcrumb-${segmentPath}`}
                path={segmentPath}
                disabled={isLast || dragDisabled}
                onClick={() => {
                  setCurrentPath(segmentPath);
                  setSelectedItems(new Set());
                }}
              >
                {segment}
              </DroppableBreadcrumb>
            </span>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(true)}>
          <FolderPlusIcon className="mr-1.5 size-3.5" />
          New Folder
        </Button>
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <UploadIcon className="mr-1.5 size-3.5" />
          Upload
        </Button>

        {/* Selection actions — verb only, count in confirmation dialog */}
        {selectedCount > 0 && (
          <>
            {selectedDocIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resyncSelectedMutation.mutate(selectedDocIds)}
                disabled={resyncSelectedMutation.isPending}
                title={`Resync ${selectedDocIds.length} selected document(s)`}
              >
                <RefreshCwIcon className="mr-1.5 size-3.5" />
                {resyncSelectedMutation.isPending ? 'Resyncing...' : 'Resync'}
              </Button>
            )}
            {selectedDocIds.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkPurgeMutation.isPending}
                    title={`Purge ${selectedDocIds.length} selected document(s)`}
                  >
                    <EraserIcon className="mr-1.5 size-3.5" />
                    {bulkPurgeMutation.isPending ? 'Purging...' : 'Purge'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Purge {selectedDocIds.length} documents?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vectors and DB records will be removed. Source files in S3 will be kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => bulkPurgeMutation.mutate(selectedDocIds)}>
                      Purge
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" title={`Delete ${selectedCount} selected item(s) from source`}>
                  <Trash2Icon className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedCount} items?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected files and folders from the source.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {isMovePending && <span className="text-muted-foreground text-xs">Moving...</span>}

        {/* Filter — right-aligned */}
        <Input
          className="ml-auto w-48"
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* File list */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && data && (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="divide-border min-w-full divide-y text-sm">
            <thead className="border-border border-b">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={toggleSelectAll}
                    disabled={allItemKeys.length === 0}
                    aria-label="Select all"
                  />
                </th>
                <SortableTh
                  align="left"
                  active={s3SortKey === 'name'}
                  dir={s3SortDir}
                  onClick={() => toggleS3Sort('name')}
                >
                  Name
                </SortableTh>
                <SortableTh
                  align="left"
                  active={s3SortKey === 'status'}
                  dir={s3SortDir}
                  onClick={() => toggleS3Sort('status')}
                >
                  Status
                </SortableTh>
                <SortableTh
                  align="right"
                  active={s3SortKey === 'size'}
                  dir={s3SortDir}
                  onClick={() => toggleS3Sort('size')}
                >
                  Size
                </SortableTh>
                <SortableTh
                  align="right"
                  active={s3SortKey === 'lastSynced'}
                  dir={s3SortDir}
                  onClick={() => toggleS3Sort('lastSynced')}
                >
                  Last Synced
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-border bg-card divide-y">
              {sortedFolders.map((folder) => {
                const folderName = folder.replace(currentPath, '').replace(/\/$/, '') || folder;
                const relativePath = folder.replace(/^.*?(?=\w)/, '');
                const isDragged = draggedIds.has(folder);
                // Disable drop on self or if any dragged folder is an ancestor
                const dropBlocked =
                  isDragged ||
                  (activeDrag?.items.some(
                    (i) => i.type === 'folder' && (folder === i.path || isDescendantOf(folder, i.path)),
                  ) ??
                    false);

                return (
                  <DroppableFolderRow
                    key={folder}
                    id={folder}
                    dragDisabled={dragDisabled}
                    dropDisabled={dropBlocked || dragDisabled}
                    isDragging={isDragged}
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedItems.has(folder)}
                        onCheckedChange={() => toggleItem(folder)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${folderName}`}
                      />
                    </td>
                    <td className="group/name px-4 py-2.5">
                      {renamingKey === folder ? (
                        <div className="flex items-center gap-2">
                          <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                          <Input
                            // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional focus for inline rename
                            autoFocus
                            defaultValue={folderName}
                            disabled={renameFolderMutation.isPending}
                            aria-invalid={(renameError !== null && renameError !== undefined) || undefined}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitFolderRename(folder, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelRename();
                              }
                            }}
                            onBlur={(e) => commitFolderRename(folder, e.currentTarget.value)}
                            className="h-7 max-w-xs px-2 text-sm font-medium"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentPath(relativePath);
                              setSelectedItems(new Set());
                            }}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                            <span className="truncate font-medium">{folderName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingKey(folder);
                              setRenameError(null);
                            }}
                            className="hover:bg-muted ml-auto rounded-md p-1 opacity-0 transition-opacity group-hover/name:opacity-100"
                            aria-label={`Rename ${folderName}`}
                            title="Rename (F2)"
                          >
                            <Edit2Icon className="text-muted-foreground size-3.5" />
                          </button>
                        </div>
                      )}
                      {renamingKey === folder && renameError && (
                        <div className="mt-1 text-xs text-red-400">{renameError}</div>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">&mdash;</td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">&mdash;</td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">&mdash;</td>
                  </DroppableFolderRow>
                );
              })}

              {pagedFiles.map((file) => {
                const fileName = file.sourceKey.split('/').pop() ?? file.sourceKey;
                const doc = file.document;
                const isDragged = draggedIds.has(file.sourceKey);

                return (
                  <DraggableFileRow
                    key={file.sourceKey}
                    id={file.sourceKey}
                    disabled={dragDisabled || !doc}
                    isDragging={isDragged}
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedItems.has(file.sourceKey)}
                        onCheckedChange={() => toggleItem(file.sourceKey)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${fileName}`}
                      />
                    </td>
                    <td
                      className="group/name px-4 py-2.5"
                      onClick={() => {
                        if (renamingKey === file.sourceKey) return;
                        if (doc) setSelectedDoc(doc);
                      }}
                      onKeyDown={(e) => {
                        if (renamingKey === file.sourceKey) return;
                        if (e.key === 'Enter' && doc) setSelectedDoc(doc);
                      }}
                    >
                      {renamingKey === file.sourceKey ? (
                        <div className="flex items-center gap-2">
                          <Input
                            // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional focus for inline rename
                            autoFocus
                            defaultValue={fileName}
                            disabled={renameFileMutation.isPending}
                            aria-invalid={(renameError !== null && renameError !== undefined) || undefined}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitFileRename(file, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelRename();
                              }
                            }}
                            onBlur={(e) => commitFileRename(file, e.currentTarget.value)}
                            className="h-7 max-w-xs px-2 text-sm font-medium"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{doc?.title ?? fileName}</div>
                            {doc?.title && <div className="text-muted-foreground truncate text-xs">{fileName}</div>}
                          </div>
                          {doc && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingKey(file.sourceKey);
                                setRenameError(null);
                              }}
                              className="hover:bg-muted ml-auto rounded-md p-1 opacity-0 transition-opacity group-hover/name:opacity-100"
                              aria-label={`Rename ${fileName}`}
                              title="Rename (F2)"
                            >
                              <Edit2Icon className="text-muted-foreground size-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {renamingKey === file.sourceKey && renameError && (
                        <div className="mt-1 text-xs text-red-400">{renameError}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {doc ? (
                        <StatusBadge variant={DOC_STATUS_MAP[doc.status] ?? 'pending'}>
                          {doc.status.replace('_', ' ')}
                        </StatusBadge>
                      ) : (
                        <span className="text-muted-foreground text-xs">untracked</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {file.size ? formatBytes(file.size) : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-muted-foreground">
                        {doc?.lastSyncedAt ? formatRelativeTime(doc.lastSyncedAt) : '\u2014'}
                      </span>
                      {doc?.searchMetaDirty && <span className="ml-1.5 text-xs text-amber-500">(needs sync)</span>}
                    </td>
                  </DraggableFileRow>
                );
              })}

              {data.folders.length === 0 && data.files.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center text-sm">
                    This folder is empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — matches DataTable pattern */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">
            Page {page + 1} of {totalPages}
          </span>
          <span className="text-muted-foreground text-xs">
            Showing {pagedFiles.length} of {totalFiles}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>{activeDrag ? <DragOverlayContent items={activeDrag.items} /> : null}</DragOverlay>

      {/* Dialogs */}
      <DocumentDetailSheet
        document={selectedDoc}
        open={selectedDoc !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSelectedDoc(null);
        }}
      />

      <UploadDialog sourceId={sourceId} defaultPath={currentPath} open={uploadOpen} onOpenChange={setUploadOpen} />

      <CreateFolderDialog
        sourceId={sourceId}
        currentPath={currentPath}
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
      />
    </DragDropProvider>
  );
}
