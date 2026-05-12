import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import {
  apiFetch,
  Button,
  DataTable,
  EmptyState,
  formatRelativeTime,
  LoadingSpinner,
  PageHeader,
  parseCsv,
} from '@typhoon/ui';
import { ChevronRightIcon, DownloadIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { detailTitle, usePageTitle } from '../../hooks/use-page-title';

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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function DatasetDetailPage() {
  const { datasetId } = useParams({ strict: false }) as { datasetId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const {
    data: dataset,
    isLoading: datasetLoading,
    error: datasetError,
  } = useQuery<Dataset>({
    queryKey: ['admin-datasets', datasetId],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}`),
  });

  usePageTitle(detailTitle('Datasets', dataset?.name));

  const { data: itemsData, isLoading: itemsLoading } = useQuery<DatasetItemsResponse>({
    queryKey: ['admin-datasets', datasetId, 'items'],
    queryFn: () => apiFetch(`/api/v1/admin/datasets/${datasetId}/items`),
    enabled: !!dataset,
  });

  const items = useMemo(() => itemsData?.items ?? [], [itemsData]);

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
      const rows = parseCsv(text);
      if (rows.length < 2) return; // Need at least header + 1 data row

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const questionIdx = header.indexOf('question');
      const answerIdx = header.indexOf('answer');
      const qIdx = questionIdx >= 0 ? questionIdx : 0;
      const aIdx = answerIdx >= 0 ? answerIdx : header.length > 1 ? 1 : -1;

      const importItems = rows
        .slice(1)
        .map((row) => ({
          input: { question: row[qIdx]?.trim() ?? '' },
          groundTruth: aIdx >= 0 ? { answer: row[aIdx]?.trim() ?? '' } : null,
        }))
        .filter((item) => item.input.question !== '');

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

  function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async function handleExport() {
    const data: DatasetItemsResponse = await apiFetch(`/api/v1/admin/datasets/${datasetId}/items`);
    const header = 'question,answer';
    const csvRows = data.items.map((item) => {
      const question =
        typeof item.input?.question === 'string' ? item.input.question : (JSON.stringify(item.input) ?? '');
      const answer =
        typeof item.groundTruth?.answer === 'string'
          ? item.groundTruth.answer
          : (JSON.stringify(item.groundTruth) ?? '');
      return `${escapeCsvField(question)},${escapeCsvField(answer)}`;
    });
    const csvContent = [header, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset?.name ?? 'dataset'}-items.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<DatasetItem, unknown>[] = useMemo(
    () => [
      {
        id: 'input',
        accessorFn: (row) => {
          const val = row.input?.question ?? row.input;
          return typeof val === 'string' ? val : JSON.stringify(val);
        },
        header: 'Input',
        cell: ({ row }) => (
          <div className="max-w-[260px] truncate">
            {truncate(row.original.input?.question ?? row.original.input, 80)}
          </div>
        ),
      },
      {
        id: 'groundTruth',
        accessorFn: (row) => {
          const val = row.groundTruth?.answer ?? row.groundTruth;
          return typeof val === 'string' ? val : JSON.stringify(val);
        },
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
                navigate({
                  to: '/datasets/$datasetId/items/$itemId',
                  params: { datasetId, itemId: row.original.id },
                });
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
    [handleDeleteItem, datasetId, navigate],
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
                  <Link to="/datasets" className="text-muted-foreground transition-colors hover:text-foreground">
                    Datasets
                  </Link>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
                  {dataset.name}
                </span>
              }
              description={dataset.description}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/datasets/$datasetId/items/create" params={{ datasetId }}>
                      <PlusIcon className="mr-1.5 size-3.5" />
                      Add Item
                    </Link>
                  </Button>

                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    <UploadIcon className="mr-1.5 size-3.5" />
                    {isImporting ? 'Importing...' : 'Import CSV'}
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
                    <DownloadIcon className="mr-1.5 size-3.5" />
                    Export CSV
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
                  enableFiltering
                  getRowId={(row) => row.id}
                  onRowClick={(row) =>
                    navigate({
                      to: '/datasets/$datasetId/items/$itemId',
                      params: { datasetId, itemId: row.id },
                    })
                  }
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
      </div>
    </div>
  );
}
