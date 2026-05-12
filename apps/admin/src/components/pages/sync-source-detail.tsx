import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LoadingSpinner,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@typhoon/ui';
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import { detailTitle, usePageTitle } from '../../hooks/use-page-title';
import { DocumentsTab } from './sync-source-detail/documents-tab';
import { OverviewTab } from './sync-source-detail/overview-tab';
import type { SyncJob, SyncTarget } from './sync-source-detail/shared';
import { formatConfig, formatCron } from './sync-source-detail/shared';
import { SyncLogTab } from './sync-source-detail/sync-log-tab';

export function SyncSourceDetailPage() {
  const { sourceId } = useParams({ strict: false }) as { sourceId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tab: activeTab, path: browsePath } = useSearch({ strict: false }) as {
    tab: string;
    path: string;
  };

  function setActiveTab(tab: string) {
    navigate({ to: '/sources/$sourceId', params: { sourceId }, search: { tab, path: '' } });
  }

  function setBrowsePath(path: string) {
    navigate({ to: '/sources/$sourceId', params: { sourceId }, search: { tab: activeTab, path }, replace: true });
  }

  const { data: target, isLoading } = useQuery<SyncTarget>({
    queryKey: ['sync-targets', sourceId],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}`),
  });

  usePageTitle(detailTitle('Sources', target?.name));

  const { data: syncJobs } = useQuery<SyncJob[]>({
    queryKey: ['sync-targets', sourceId, 'jobs'],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}/jobs`),
  });

  const hasRunningSync = syncJobs?.some((j) => j.status === 'running') ?? false;

  const cancelSync = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/sync-targets/${sourceId}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets', sourceId, 'jobs'] });
    },
  });

  const triggerSync = useMutation({
    mutationFn: (force?: boolean) =>
      apiFetch(`/api/v1/sync-targets/${sourceId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: !!force }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-targets', sourceId, 'jobs'] }),
  });

  const purgeDocuments = useMutation({
    mutationFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}/purge`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', { syncTargetId: sourceId }] });
      queryClient.invalidateQueries({ queryKey: ['sync-targets', sourceId, 'jobs'] });
    },
  });

  const deleteTarget = useMutation({
    mutationFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-targets'] });
      navigate({ to: '/sources' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!target) {
    return <div className="p-8 text-center text-muted-foreground">Sync source not found.</div>;
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/sources" className="text-muted-foreground transition-colors hover:text-foreground">
                Sources
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              {target.name}
            </span>
          }
          description={`${formatConfig(target.sourceType, target.config)} \u2014 ${formatCron(target.cronSchedule)}`}
          actions={
            <div className="flex items-center gap-2">
              {target.isActive && hasRunningSync && (
                <Button variant="outline" size="sm" onClick={() => cancelSync.mutate()} disabled={cancelSync.isPending}>
                  <SquareIcon className="mr-1.5 size-3.5" />
                  {cancelSync.isPending ? 'Cancelling...' : 'Cancel Sync'}
                </Button>
              )}
              {target.isActive && (
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-r-none border-r-0"
                    onClick={() => triggerSync.mutate(false)}
                    disabled={triggerSync.isPending}
                  >
                    <RefreshCwIcon className="mr-1.5 size-3.5" />
                    {triggerSync.isPending ? 'Syncing...' : 'Sync Now'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-l-none px-1.5"
                        disabled={triggerSync.isPending}
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => triggerSync.mutate(false)}>
                        <RefreshCwIcon className="mr-2 size-3.5" />
                        Sync new &amp; changed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => triggerSync.mutate(true)}>
                        <RefreshCwIcon className="mr-2 size-3.5" />
                        Force re-sync all
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={purgeDocuments.isPending}>
                    <Trash2Icon className="mr-1.5 size-3.5" />
                    Purge
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Purge documents?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All documents and vectors for this source will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => purgeDocuments.mutate()}>Purge</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {target.managedBy !== 'config' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={deleteTarget.isPending}>
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete &ldquo;{target.name}&rdquo;?</AlertDialogTitle>
                      <AlertDialogDescription>This will also remove its documents and vectors.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteTarget.mutate()}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          }
        />

        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="sync-log">Sync Log</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <OverviewTab sourceId={sourceId} target={target} />
            </TabsContent>
            <TabsContent value="documents" className="mt-4">
              <DocumentsTab
                sourceId={sourceId}
                sourceType={target.sourceType}
                browsePath={browsePath}
                onBrowsePathChange={setBrowsePath}
              />
            </TabsContent>
            <TabsContent value="sync-log" className="mt-4">
              <SyncLogTab sourceId={sourceId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
