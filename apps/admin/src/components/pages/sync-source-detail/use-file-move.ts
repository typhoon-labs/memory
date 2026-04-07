import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export type DragItem =
  | { type: 'file'; sourceKey: string; documentId: string; title: string | null }
  | { type: 'folder'; path: string };

export function computeDestination(item: DragItem, targetPath: string): string {
  if (item.type === 'file') {
    const basename = item.sourceKey.split('/').pop() ?? item.sourceKey;
    return `${targetPath}${basename}`;
  }
  const folderName = item.path.replace(/\/$/, '').split('/').pop() ?? item.path;
  return `${targetPath}${folderName}/`;
}

export function isDescendantOf(childPath: string, parentPath: string): boolean {
  return childPath.startsWith(parentPath) && childPath !== parentPath;
}

async function moveFile(documentId: string, newSourceKey: string): Promise<void> {
  const res = await fetch(`/api/v1/documents/${documentId}/move`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newSourceKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Move failed' }));
    throw new Error(err.error ?? 'Move failed');
  }
}

async function moveFolder(sourceId: string, oldPath: string, newPath: string): Promise<void> {
  const res = await fetch(`/api/v1/sync-targets/${sourceId}/folders/move`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Move failed' }));
    throw new Error(err.error ?? 'Move failed');
  }
}

export function useFileMove(sourceId: string) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveItems = useCallback(
    async (items: DragItem[], destinationPath: string) => {
      setIsPending(true);
      setError(null);

      const promises = items.map((item) => {
        const dest = computeDestination(item, destinationPath);
        if (item.type === 'file') {
          return moveFile(item.documentId, dest);
        }
        return moveFolder(sourceId, item.path, dest);
      });

      const results = await Promise.allSettled(promises);
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : 'Unknown error'));

      if (errors.length > 0) {
        setError(
          errors.length === 1 ? (errors[0] ?? 'Move failed') : `${errors.length} moves failed: ${errors.join(', ')}`,
        );
      }

      queryClient.invalidateQueries({ queryKey: ['browse', sourceId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setIsPending(false);
    },
    [sourceId, queryClient],
  );

  const clearError = useCallback(() => setError(null), []);

  return { moveItems, isPending, error, clearError };
}
