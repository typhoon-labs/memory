import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiFetch,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@typhoon/ui';
import { FolderPlusIcon } from 'lucide-react';
import { useState } from 'react';

export function CreateFolderDialog({
  sourceId,
  currentPath,
  open,
  onOpenChange,
}: {
  sourceId: string;
  currentPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [folderName, setFolderName] = useState('');

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const path = `${currentPath}${name}/`;
      return apiFetch(`/api/v1/sync-targets/${sourceId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', 'browse', sourceId] });
      setFolderName('');
      onOpenChange(false);
    },
  });

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFolderName('');
      createMutation.reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              placeholder="e.g. policies"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderName.trim()) createMutation.mutate(folderName.trim());
              }}
            />
            {currentPath && <p className="text-muted-foreground text-xs">Will be created in: {currentPath}</p>}
          </div>

          {createMutation.error && <p className="text-sm text-red-400">{createMutation.error.message}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate(folderName.trim())}
            disabled={!folderName.trim() || createMutation.isPending}
          >
            <FolderPlusIcon className="mr-1.5 size-3.5" />
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
