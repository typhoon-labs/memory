import { CollisionPriority } from '@dnd-kit/abstract';
import { useDraggable, useDroppable } from '@dnd-kit/react';
import { Checkbox } from '@typhoon/ui';
import { FileTextIcon, FolderIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DragItem } from './use-file-move';

// ── Draggable file row ─────────────────────────────────────────

export function DraggableFileRow({
  id,
  disabled,
  isDragging,
  children,
}: {
  id: string;
  disabled?: boolean;
  isDragging: boolean;
  children: ReactNode;
}) {
  const { ref } = useDraggable({ id, type: 'file', disabled });

  return (
    <tr ref={ref} className={`hover:bg-accent cursor-pointer transition-colors ${isDragging ? 'opacity-40' : ''}`}>
      {children}
    </tr>
  );
}

// ── Droppable + draggable folder row ───────────────────────────

export function DroppableFolderRow({
  id,
  dragDisabled,
  dropDisabled,
  isDragging,
  children,
}: {
  id: string;
  dragDisabled?: boolean;
  dropDisabled?: boolean;
  isDragging: boolean;
  children: ReactNode;
}) {
  const { ref: dragRef } = useDraggable({ id, type: 'folder', disabled: dragDisabled });
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `drop-${id}`,
    type: 'folder',
    accept: ['file', 'folder'],
    collisionPriority: CollisionPriority.Normal,
    disabled: dropDisabled,
  });

  return (
    <tr
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      className={`hover:bg-accent transition-colors ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-primary bg-primary/5 ring-2' : ''}`}
    >
      {children}
    </tr>
  );
}

// ── Droppable breadcrumb ───────────────────────────────────────

export function DroppableBreadcrumb({
  id,
  path,
  disabled,
  onClick,
  children,
}: {
  id: string;
  path: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id,
    type: 'breadcrumb',
    accept: ['file', 'folder'],
    collisionPriority: CollisionPriority.Low,
    disabled,
    data: { path },
  });

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`text-muted-foreground hover:text-foreground rounded px-1 transition-colors ${isDropTarget ? 'bg-primary/10 text-foreground' : ''}`}
    >
      {children}
    </button>
  );
}

// ── Drag overlay content ───────────────────────────────────────

export function DragOverlayContent({ items }: { items: DragItem[] }) {
  if (items.length === 0) return null;

  if (items.length === 1 && items[0]) {
    const item = items[0];
    // Mirror the row's display: file rows show `doc.title ?? basename`
    // (with the basename as a smaller subtitle when a title exists), so the
    // drag overlay does the same.
    const Icon = item.type === 'folder' ? FolderIcon : FileTextIcon;
    let primary: string;
    let subtitle: string | null = null;
    if (item.type === 'file') {
      const basename = item.sourceKey.split('/').pop() ?? item.sourceKey;
      primary = item.title ?? basename;
      subtitle = item.title ? basename : null;
    } else {
      primary = item.path.replace(/\/$/, '').split('/').pop() ?? item.path;
    }

    return (
      <div className="border-border bg-card pointer-events-none flex items-center gap-2 rounded-md border px-3 py-2 text-sm opacity-60 shadow-lg">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0">
          <div className="max-w-48 truncate font-medium">{primary}</div>
          {subtitle && <div className="text-muted-foreground max-w-48 truncate text-xs">{subtitle}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-card pointer-events-none rounded-md border px-3 py-2 text-sm opacity-60 shadow-lg">
      <div className="flex items-center gap-2">
        <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="font-medium">Moving {items.length} items</span>
      </div>
    </div>
  );
}

// ── Move error banner ──────────────────────────────────────────

export function MoveErrorBanner({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;

  return (
    <div className="border-destructive/20 bg-destructive/10 text-destructive mb-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <span>{error}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 p-0.5 hover:opacity-70" aria-label="Dismiss error">
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

// Re-export Checkbox for convenience (used in row rendering)
export { Checkbox };
