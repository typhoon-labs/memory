import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  formatAbsoluteTime,
  formatRelativeTime,
  Label,
  LoadingSpinner,
  PageHeader,
  SectionLabel,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@typhoon/ui';
import { ChevronRightIcon, DownloadIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  version: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DatasetItem {
  id: string;
  datasetId: string;
  input: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface DatasetItemsResponse {
  items: DatasetItem[];
}

function truncate(value: unknown, maxLength: number): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!str) return '\u2014';
  return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? '';
}

// ---------------------------------------------------------------------------
// Edit Item Dialog
// ---------------------------------------------------------------------------

function EditItemDialog({
  item,
  datasetId,
  open,
  onOpenChange,
}: {
  item: DatasetItem;
  datasetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState(() => stringify(item.input?.question ?? item.input));
  const [outputValue, setOutputValue] = useState(() => stringify(item.groundTruth?.answer ?? item.groundTruth));
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { question: inputValue.trim() },
          groundTruth: { answer: outputValue.trim() },
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Test Case</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-input">Input Question</Label>
            <Textarea id="edit-input" value={inputValue} onChange={(e) => setInputValue(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-output">Expected Output / Ground Truth</Label>
            <Textarea id="edit-output" value={outputValue} onChange={(e) => setOutputValue(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Item Detail Sheet
// ---------------------------------------------------------------------------

function ItemDetailSheet({
  item,
  open,
  onOpenChange,
  onEdit,
}: {
  item: DatasetItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: DatasetItem) => void;
}) {
  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Test Case</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div>
            <SectionLabel>Input</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {stringify(item.input?.question ?? item.input)}
            </p>
          </div>

          <div>
            <SectionLabel>Expected Output</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {stringify(item.groundTruth?.answer ?? item.groundTruth)}
            </p>
          </div>

          <div>
            <SectionLabel>Timestamps</SectionLabel>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="mt-0.5">{formatAbsoluteTime(item.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5">{formatAbsoluteTime(item.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(item);
              }}
            >
              <PencilIcon className="mr-1.5 size-3.5" />
              Edit
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function DatasetDetailPage() {
  const { datasetId } = useParams({ strict: false }) as { datasetId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DatasetItem | null>(null);
  const [viewingItem, setViewingItem] = useState<DatasetItem | null>(null);
  const [inputQuestion, setInputQuestion] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const {
    data: dataset,
    isLoading: datasetLoading,
    error: datasetError,
  } = useQuery<Dataset>({
    queryKey: ['admin-datasets', datasetId],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}`),
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<DatasetItemsResponse>({
    queryKey: ['admin-datasets', datasetId, 'items'],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}/items`),
    enabled: !!dataset,
  });

  const items = useMemo(() => itemsData?.items ?? [], [itemsData]);

  async function handleAddItem() {
    if (!inputQuestion.trim()) return;
    setIsAdding(true);
    try {
      await apiFetch(`/api/v1/admin/datasets/${datasetId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { question: inputQuestion.trim() },
          groundTruth: { answer: expectedOutput.trim() },
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId] });
      setInputQuestion('');
      setExpectedOutput('');
      setAddDialogOpen(false);
    } finally {
      setIsAdding(false);
    }
  }

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      await apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
        method: 'DELETE',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId] });
    },
    [datasetId, queryClient],
  );

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importItems = Array.isArray(parsed) ? parsed : parsed.items;
      await apiFetch(`/api/v1/admin/datasets/${datasetId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importItems }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId] });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleExport() {
    const data: DatasetItemsResponse = await apiFetch(`/api/v1/admin/datasets/${datasetId}/items`);
    const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset?.name ?? 'dataset'}-items.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<DatasetItem, unknown>[] = useMemo(
    () => [
      {
        id: 'input',
        header: 'Input',
        cell: ({ row }) => (
          <div className="max-w-[260px] truncate">
            {truncate(row.original.input?.question ?? row.original.input, 80)}
          </div>
        ),
      },
      {
        id: 'groundTruth',
        header: 'Expected Output',
        cell: ({ row }) => (
          <div className="max-w-[320px] truncate">
            {truncate(row.original.groundTruth?.answer ?? row.original.groundTruth, 80)}
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => <span className="text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem(row.original);
              }}
            >
              <PencilIcon className="size-3.5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteItem(row.original.id);
              }}
            >
              <Trash2Icon className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDeleteItem],
  );

  if (datasetError) {
    return (
      <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="p-8 text-center text-muted-foreground">
            {datasetError instanceof Error ? datasetError.message : 'Failed to load dataset.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {datasetLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!datasetLoading && dataset && (
          <>
            <PageHeader
              title={
                <span className="flex items-center gap-1.5">
                  <a
                    href="/datasets"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate({ to: '/datasets' });
                    }}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Datasets
                  </a>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
                  {dataset.name}
                </span>
              }
              description={dataset.description}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <PlusIcon className="mr-1.5 size-3.5" />
                        Add Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Test Case</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col gap-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="item-input">Input Question</Label>
                          <Textarea
                            id="item-input"
                            placeholder="Enter the question or input..."
                            value={inputQuestion}
                            onChange={(e) => setInputQuestion(e.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="item-output">Expected Output / Ground Truth</Label>
                          <Textarea
                            id="item-output"
                            placeholder="Enter the expected answer..."
                            value={expectedOutput}
                            onChange={(e) => setExpectedOutput(e.target.value)}
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddItem} disabled={!inputQuestion.trim() || isAdding}>
                          {isAdding ? 'Adding...' : 'Add Item'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    <UploadIcon className="mr-1.5 size-3.5" />
                    {isImporting ? 'Importing...' : 'Import JSON'}
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
                    <DownloadIcon className="mr-1.5 size-3.5" />
                    Export JSON
                  </Button>
                </div>
              }
            />

            {itemsLoading && (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            )}

            {!itemsLoading && items.length > 0 && (
              <div className="mt-6">
                <DataTable
                  data={items}
                  columns={columns}
                  enableSorting
                  getRowId={(row) => row.id}
                  onRowClick={setViewingItem}
                  showRowCount
                />
              </div>
            )}

            {!itemsLoading && items.length === 0 && (
              <div className="mt-6">
                <EmptyState
                  icon={<PlusIcon className="size-8" />}
                  title="No test cases yet"
                  description="Add items to build your evaluation dataset."
                />
              </div>
            )}
          </>
        )}

        {editingItem && (
          <EditItemDialog
            item={editingItem}
            datasetId={datasetId}
            open={!!editingItem}
            onOpenChange={(open) => {
              if (!open) setEditingItem(null);
            }}
          />
        )}

        <ItemDetailSheet
          item={viewingItem}
          open={!!viewingItem}
          onOpenChange={(open) => {
            if (!open) setViewingItem(null);
          }}
          onEdit={(item) => {
            setViewingItem(null);
            setEditingItem(item);
          }}
        />
      </div>
    </div>
  );
}
