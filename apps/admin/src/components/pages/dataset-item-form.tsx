import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
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
  Label,
  LoadingSpinner,
  PageHeader,
  Separator,
  Textarea,
} from '@typhoon/ui';
import { ChevronRightIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { usePageTitle } from '../../hooks/use-page-title';

interface Dataset {
  id: string;
  name: string;
}

interface DatasetItem {
  id: string;
  datasetId: string;
  input: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? '';
}

export function DatasetItemFormPage() {
  const { datasetId, itemId } = useParams({ strict: false }) as { datasetId: string; itemId?: string };
  const isCreateMode = !itemId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inputValue, setInputValue] = useState('');
  const [outputValue, setOutputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: dataset } = useQuery<Dataset>({
    queryKey: ['admin-datasets', datasetId],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}`),
  });

  // Fetch all items to find the one we're editing (no single-item GET endpoint)
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: DatasetItem[] }>({
    queryKey: ['admin-datasets', datasetId, 'items'],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}/items`),
    enabled: !isCreateMode,
  });

  const item = useMemo(() => itemsData?.items.find((i) => i.id === itemId), [itemsData, itemId]);

  usePageTitle(isCreateMode ? 'Add Item' : 'Edit Item');

  useEffect(() => {
    if (item) {
      setInputValue(stringify(item.input?.question ?? item.input));
      setOutputValue(stringify(item.groundTruth?.answer ?? item.groundTruth));
    }
  }, [item]);

  async function handleSave() {
    setIsSaving(true);
    try {
      if (isCreateMode) {
        await apiFetch(`/api/v1/admin/datasets/${datasetId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { question: inputValue.trim() },
            groundTruth: { answer: outputValue.trim() },
          }),
        });
      } else {
        await apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { question: inputValue.trim() },
            groundTruth: { answer: outputValue.trim() },
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId] });
      navigate({ to: '/datasets/$datasetId', params: { datasetId } });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    await apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId, 'items'] });
    queryClient.invalidateQueries({ queryKey: ['admin-datasets', datasetId] });
    navigate({ to: '/datasets/$datasetId', params: { datasetId } });
  }

  if (!isCreateMode && itemsLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isCreateMode && !itemsLoading && !item) {
    return (
      <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="text-muted-foreground mx-auto max-w-5xl text-center">Item not found.</div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/datasets" className="text-muted-foreground hover:text-foreground transition-colors">
                Datasets
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              <Link
                to="/datasets/$datasetId"
                params={{ datasetId }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {dataset?.name ?? '...'}
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              {isCreateMode ? 'Add Item' : 'Edit Item'}
            </span>
          }
          actions={
            !isCreateMode ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2Icon className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete test case?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this test case.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : undefined
          }
        />

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Test Case</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Define the input question and expected output for evaluation.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-input">Input Question</Label>
            <Textarea
              id="item-input"
              placeholder="Enter the question or input..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-output">Expected Output / Ground Truth</Label>
            <Textarea
              id="item-output"
              placeholder="Enter the expected answer..."
              value={outputValue}
              onChange={(e) => setOutputValue(e.target.value)}
              rows={4}
            />
          </div>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/datasets/$datasetId', params: { datasetId } })}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!inputValue.trim() || isSaving}>
              {isSaving ? 'Saving...' : isCreateMode ? 'Add Item' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
