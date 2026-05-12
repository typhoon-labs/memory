import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiFetch,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@typhoon/ui';
import { FolderIcon, UploadIcon, XIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDialog({
  sourceId,
  defaultPath = '',
  open,
  onOpenChange,
}: {
  sourceId: string;
  defaultPath?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [subPath, setSubPath] = useState(defaultPath);
  const [isDragging, setIsDragging] = useState(false);
  const prevOpen = useRef(false);
  if (open && !prevOpen.current) {
    setSubPath(defaultPath);
  }
  prevOpen.current = open;

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (subPath.trim()) {
        formData.append('path', subPath.trim());
      }
      return apiFetch(`/api/v1/sync-targets/${sourceId}/upload`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', { syncTargetId: sourceId }] });
      queryClient.invalidateQueries({ queryKey: ['browse', sourceId] });
      setSelectedFiles([]);
      setSubPath(defaultPath);
      onOpenChange(false);
    },
  });

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const newFiles = arr.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...newFiles];
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // Reset so the same file can be selected again
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedFiles([]);
      setSubPath(defaultPath);
      uploadMutation.reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>Upload files directly to this sync source for processing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <UploadIcon className={`size-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm text-muted-foreground">
              {isDragging ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, Markdown, HTML, TXT, CSV, JSON</p>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.md,.txt,.html,.htm,.csv,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Directory path */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upload-path" className="flex items-center gap-1.5">
              <FolderIcon className="size-3.5" />
              Upload path (optional)
            </Label>
            <Input
              id="upload-path"
              placeholder="e.g. docs/policies"
              value={subPath}
              onChange={(e) => setSubPath(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Subdirectory within the sync source prefix. Leave empty for root.
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </p>
              {selectedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 rounded p-0.5 transition-colors hover:bg-muted"
                  >
                    <XIcon className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadMutation.error && <p className="text-sm text-red-400">{uploadMutation.error.message}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploadMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => uploadMutation.mutate(selectedFiles)}
            disabled={selectedFiles.length === 0 || uploadMutation.isPending}
          >
            <UploadIcon className="mr-1.5 size-3.5" />
            {uploadMutation.isPending
              ? `Uploading ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}...`
              : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
