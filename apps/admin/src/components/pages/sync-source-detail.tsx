import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
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
  Button,
  LoadingSpinner,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@typhoon/ui';
import { ChevronLeftIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { DocumentsTab } from './sync-source-detail/documents-tab.js';
import { OverviewTab } from './sync-source-detail/overview-tab.js';
import type { SyncTarget } from './sync-source-detail/shared.js';
import { formatConfig } from './sync-source-detail/shared.js';
import { SyncLogTab } from './sync-source-detail/sync-log-tab.js';

export function SyncSourceDetailPage() {
  const { sourceId } = useParams({ strict: false }) as { sourceId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: target, isLoading } = useQuery<SyncTarget>({
    queryKey: ['sync-targets', sourceId],
    queryFn: () => fetch(`/api/v1/sync-targets/${sourceId}`, { credentials: 'include' }).then((r) => r.json()),
  });

  const triggerSync = useMutation({
    mutationFn: () => fetch(`/api/v1/sync-targets/${sourceId}/sync`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-targets', sourceId, 'jobs'] }),
  });

  const purgeDocuments = useMutation({
    mutationFn: () => fetch(`/api/v1/sync-targets/${sourceId}/purge`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', { syncTargetId: sourceId }] });
      queryClient.invalidateQueries({ queryKey: ['sync-targets', sourceId, 'jobs'] });
    },
  });

  const deleteTarget = useMutation({
    mutationFn: () => fetch(`/api/v1/sync-targets/${sourceId}`, { method: 'DELETE', credentials: 'include' }),
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
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/sources' })}
            className="gap-1 text-muted-foreground"
          >
            <ChevronLeftIcon className="size-4" />
            Back to Sources
          </Button>
        </div>

        <PageHeader
          title={target.name}
          description={`${formatConfig(target.sourceType, target.config)} \u2014 ${target.cronSchedule}`}
          actions={
            <div className="flex items-center gap-2">
              {target.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerSync.mutate()}
                  disabled={triggerSync.isPending}
                >
                  <RefreshCwIcon className="mr-1.5 size-3.5" />
                  {triggerSync.isPending ? 'Syncing...' : 'Sync Now'}
                </Button>
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
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="sync-log">Sync Log</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <OverviewTab sourceId={sourceId} target={target} />
            </TabsContent>
            <TabsContent value="documents" className="mt-4">
              <DocumentsTab sourceId={sourceId} />
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
